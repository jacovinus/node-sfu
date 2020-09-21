import { RTCRtpReceiver } from "./rtpReceiver";
import { RTCRtpSender } from "./rtpSender";
import { RTCDtlsTransport } from "../transport/dtls";
import {
  RTCRtpCodecParameters,
  RTCRtpHeaderExtensionParameters,
  RTCRtpParameters,
} from "./parameters";
import * as uuid from "uuid";
import { Kind } from "../../typings/domain";
import { RtpTrack } from "./track";
import Event from "rx.mini";
import { RtpPacket } from "../../vendor/rtp/rtp/rtp";

export const Directions = [
  "sendonly" as const,
  "sendrecv" as const,
  "recvonly" as const,
  "inactive" as const,
];

export type Direction = typeof Directions[0];

export type TransceiverOptions = {
  simulcast: { direction: "send" | "recv"; rid: string }[];
};

export class RTCRtpTransceiver {
  uuid = uuid.v4();
  bundled = false;
  mid?: string;
  mLineIndex?: number;
  dtlsTransport?: RTCDtlsTransport;
  codecs: RTCRtpCodecParameters[] = [];
  headerExtensions: RTCRtpHeaderExtensionParameters[] = [];
  senderParams: RTCRtpParameters;
  onTrack = new Event<RtpTrack>();
  options: Partial<TransceiverOptions> = {};

  constructor(
    public kind: Kind,
    public receiver: RTCRtpReceiver,
    public sender: RTCRtpSender,
    public direction: Direction
  ) {}

  addTrack(track: RtpTrack) {
    const exist = this.receiver.tracks.find((t) => {
      if (t.rid) return t.rid === track.rid;
      if (t.ssrc) return t.ssrc === track.ssrc;
    });
    if (!exist) {
      this.receiver.tracks.push(track);
      this.onTrack.execute(track);
    }
  }

  sendRtp = (rtp: Buffer | RtpPacket) => {
    if (this.direction === "inactive") return;
    if (!this.senderParams) return;

    this.sender.sendRtp(rtp, this.senderParams);
  };
}