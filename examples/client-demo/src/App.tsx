import { FC, useContext, useEffect, useRef, useState } from "react";
import { Context } from ".";
import {
  ClientSDK,
  MediaInfo,
  SubscriberType,
} from "../../../packages/client/src";

const App: FC = () => {
  const clientSDK = useContext(Context);
  const videos = useRef<HTMLVideoElement[]>([]);
  const [streams, setStreams] = useState<
    { stream: MediaStream; info: MediaInfo }[]
  >([]);

  const init = async (clientSDK: ClientSDK) => {
    const params = new URLSearchParams(window.location.hash.split("#")[1]);

    if (!params.has("room")) {
      await clientSDK.create();
      window.location.hash = `?room=${clientSDK.roomName}`;
    } else clientSDK.roomName = params.get("room")!;

    console.log("roomName", clientSDK.roomName);

    await clientSDK.join();

    clientSDK.onPublish.subscribe((info) => {
      if (info.publisherId !== clientSDK.peerId) {
        console.log(info, clientSDK.peerId);
        clientSDK.subscribe([info]);
      }
    });
    clientSDK.onTrack.subscribe((stream, info) => {
      stream.onremovetrack = () => {
        setStreams((streams) =>
          streams.filter(({ stream: s }) => stream.id !== s.id)
        );
      };
      setStreams((streams) => [...streams, { stream, info }]);
    });
    clientSDK.onJoin.subscribe((peerId) => {
      console.log("join", peerId);
    });

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });

    await clientSDK.publish([
      { track: mediaStream.getVideoTracks()[0], simulcast: true },
    ]);
    console.log("published");
    const infos = await clientSDK.getTracks();
    await clientSDK.subscribe(infos);
    console.log("joined");
  };

  useEffect(() => {
    init(clientSDK);
  }, []);

  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (streams[i]) v.srcObject = streams[i].stream;
    });
  }, [streams]);

  const changeQuality = (info: MediaInfo, type: SubscriberType) => {
    clientSDK.changeQuality(info, type);
  };

  const unPublish = (info: MediaInfo) => {
    clientSDK.unPublish(info);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
        {streams.map(({ info }, i) => (
          <div key={i}>
            <p>{`${info.mediaId} ${info.publisherId}`}</p>
            <button onClick={() => changeQuality(info, "low")}>low</button>
            <button onClick={() => changeQuality(info, "high")}>high</button>
            <button onClick={() => changeQuality(info, "auto")}>auto</button>
            <button onClick={() => unPublish(info)}>un publish</button>
            <br />
            <video
              ref={(ref) => {
                const arr = videos.current;
                arr[i] = ref!;
                videos.current = arr;
              }}
              autoPlay
              style={{ background: "black" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
