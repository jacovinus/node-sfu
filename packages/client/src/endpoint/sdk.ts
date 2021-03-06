import { Kind, MediaInfo, RequestSubscribe, SubscriberType } from "../";
import { DataChannelConnection } from "../connection/dc";
import { HttpConnection } from "../connection/http";
import { Events } from "../context/events";
import { MCU } from "../domain/mcu";
import { Media } from "../domain/media";
import { SFU } from "../domain/sfu";
import { PromiseQueue } from "../util";
import { SFUEndpoint } from "./sfu";

export class ClientSDK {
  private readonly peer: RTCPeerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  private readonly httpConnection = new HttpConnection({ url: this.url });
  private dcConnection!: DataChannelConnection;
  private readonly events = new Events();
  private readonly sfu = new SFU(this.peer, this.events);
  private readonly sfuEndpoint = new SFUEndpoint(this.events, this.sfu);
  private subscribeQueue = new PromiseQueue();

  readonly media = new Media(this.events);
  readonly mcu = new MCU(this.peer);

  readonly onPublish = this.events.onPublish;
  readonly onUnPublish = this.events.onUnPublish;
  readonly onLeave = this.events.onLeave;
  readonly onJoin = this.events.onJoin;
  readonly onTrack = this.events.onTrack;

  constructor(private url: string) {}

  get peerId() {
    return this.sfu.peerId;
  }

  get roomName() {
    return this.sfu.roomName;
  }
  set roomName(roomName: string) {
    this.sfu.roomName = roomName;
  }

  async create() {
    this.sfu.roomName = await this.httpConnection.create();
  }

  async join() {
    const { offer, peerId } = await this.httpConnection.join(this.roomName);
    this.sfu.peerId = peerId;

    const channel = await this.sfu.join(offer, {
      onIceCandidate: (candidate) =>
        this.httpConnection.candidate(peerId, this.roomName, candidate),
      onAnswer: (answer) =>
        this.httpConnection.answer(peerId, this.roomName, answer),
    });

    this.dcConnection = new DataChannelConnection(peerId, channel);
    this.sfu.onIceCandidate.subscribe(this.dcConnection.sendCandidate);
    this.sfuEndpoint.listen(this.dcConnection);
  }

  async publish(requests: { track: MediaStreamTrack; simulcast?: boolean }[]) {
    const publishRequests = requests.map(({ track, simulcast }) => ({
      kind: track.kind as Kind,
      simulcast: !!simulcast,
    }));
    const offer = await this.dcConnection.publish([
      this.peerId,
      publishRequests,
    ]);
    const answer = await this.sfu.publish(requests, offer as any);
    await this.dcConnection.sendAnswer(answer);
  }

  async unPublish(info: MediaInfo) {
    this.events.onUnPublish.execute(info);

    const offer = await this.dcConnection.unPublish([info]);
    const answer = await this.sfu.setOffer(offer as any);

    await this.dcConnection.sendAnswer(answer);
  }

  async getTracks() {
    return await this.dcConnection.getMedias([this.peerId]);
  }

  async subscribe(infos: MediaInfo[]) {
    await this.subscribeQueue.push(async () => {
      const requests: RequestSubscribe[] = infos.map((info) => {
        return {
          info,
          type: info.kind === "audio" ? "single" : "high",
        };
      });
      const [offer, pairs] = await this.dcConnection.subscribe([
        this.peerId,
        requests,
      ]);
      const answer = await this.sfu.subscribe(pairs, infos, offer as any);
      await this.dcConnection.sendAnswer(answer);
    });
  }

  async listenMixedAudio(infos: MediaInfo[]) {
    const [offer, meta] = await this.dcConnection.listenMixedAudio([
      this.peerId,
      infos,
    ]);
    const answer = await this.mcu.listen(offer as any, meta.mixId);

    await this.dcConnection.sendAnswer(answer);
  }

  addMixedAudioTrack(mixerId: string, info: MediaInfo) {
    this.mcu.add(mixerId, info);
    this.dcConnection.addMixedAudioTrack([mixerId, info]);
  }

  removeMixedAudioTrack(mixerId: string, info: MediaInfo) {
    this.mcu.remove(mixerId, info);
    this.dcConnection.removeMixedAudioTrack([mixerId, info]);
  }

  changeQuality(info: MediaInfo, type: SubscriberType) {
    this.dcConnection.changeQuality([this.peerId, info, type]);
  }
}
