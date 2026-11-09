
import React, { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";

const KEYWORD = "거짓말 탐지기";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const lastAlertRef = useRef(0);

  const [sharing, setSharing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [status, setStatus] = useState(
    "화면 공유를 시작해 주세요"
  );

  const [found, setFound] = useState(false);
  const [sound, setSound] = useState(true);

  // 알림 설정
  const [soundType, setSoundType] = useState("bell");
  const [volume, setVolume] = useState(70);
  const [repeatCount, setRepeatCount] = useState(1);
  const [customSound, setCustomSound] = useState(null);

  const [intervalMs, setIntervalMs] = useState(1800);

  const [logs, setLogs] = useState([]);

  const [latestText, setLatestText] = useState(
    "아직 인식된 문구가 없습니다."
  );

  // OCR 엔진 초기화
  useEffect(() => {
    let cancelled = false;

    const initOCR = async () => {
      setStatus("한국어 OCR 엔진 준비 중…");

      try {
        const worker = await createWorker("kor+eng");

        if (cancelled) {
          await worker.terminate();
          return;
        }

        workerRef.current = worker;
        setOcrReady(true);

        setStatus(
          "준비 완료 · 게임 화면 공유 대기"
        );
      } catch (error) {
        console.error("OCR 초기화 오류:", error);

        setStatus(
          "OCR 엔진을 불러오지 못했어요."
        );
      }
    };

    initOCR();

    return () => {
      cancelled = true;

      stop();

      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // 알림음 재생
  const alertSound = async () => {
    if (!sound) return;

    try {
      // 사용자 지정 MP3 / WAV
      if (soundType === "custom" && customSound) {
        for (let i = 0; i < repeatCount; i++) {
          const audio = new Audio(customSound);

          audio.volume = volume / 100;

          await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = reject;

            audio.play().catch(reject);
          });
        }

        return;
      }

      // 음성 알림
      if (soundType === "voice") {
        for (let i = 0; i < repeatCount; i++) {
          await new Promise((resolve) => {
            const utterance =
              new SpeechSynthesisUtterance(
                "거짓말 탐지기 발생!"
              );

            utterance.lang = "ko-KR";
            utterance.volume = volume / 100;

            utterance.onend = resolve;
            utterance.onerror = resolve;

            window.speechSynthesis.speak(
              utterance
            );
          });
        }

        return;
      }

      // 기본 종소리 / 경고음
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      const ctx = new AudioContext();

      await ctx.resume();

      for (let i = 0; i < repeatCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type =
          soundType === "warning"
            ? "square"
            : "sine";

        osc.frequency.setValueAtTime(
          soundType === "warning" ? 1200 : 880,
          ctx.currentTime
        );

        gain.gain.setValueAtTime(
          0.001,
          ctx.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
          (volume / 100) * 0.3,
          ctx.currentTime + 0.03
        );

        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + 0.5
        );

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);

        await new Promise((resolve) =>
          setTimeout(resolve, 650)
        );
      }

      await ctx.close();
    } catch (error) {
      console.error("알림음 재생 오류:", error);
    }
  };

  // OCR 텍스트 정규화
  const normalizeText = (value) => {
    return value
      .replace(/\s/g, "")
      .replace(/[.,!?·:]/g, "");
  };

  // 게임 화면 분석
  const scan = async () => {
    if (
      busyRef.current ||
      !workerRef.current ||
      !videoRef.current ||
      videoRef.current.readyState < 2
    ) {
      return;
    }

    busyRef.current = true;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const ctx = canvas.getContext("2d");

      const width = video.videoWidth;
      const height = video.videoHeight;

      // OCR 분석용 이미지 크기 조정
      const scale = Math.min(1, 1600 / width);

      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);

      // 전체 화면 분석
      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const { data } =
        await workerRef.current.recognize(canvas);

      const originalText = data.text || "";

      const text = normalizeText(originalText);

      setLatestText(
        originalText.trim() ||
          "인식된 텍스트 없음"
      );

      // 감지 키워드
      const keywords = [
        "거짓말",
        "비올레타",
        "거짓말탐지기",
        "거짓말탐지기가",
        "거짓말탐지기발동",
        "거짓말 탐지기가",
        "입력을 위해 먼저",
      ];

      const matched = keywords.some((keyword) =>
        text.includes(normalizeText(keyword))
      );

      setFound(matched);

      if (matched) {
        const now = Date.now();

        // 10초 중복 알림 방지
        if (
          now - lastAlertRef.current > 10000
        ) {
          lastAlertRef.current = now;

          alertSound();

          const time =
            new Date().toLocaleTimeString(
              "ko-KR"
            );

          setLogs((prev) => [
            {
              time,
              message:
                KEYWORD + " 문구 감지",
            },
            ...prev,
          ].slice(0, 5));

          setStatus(
            "거짓말 탐지기 문구 감지! 알림을 재생했어요."
          );
        }
      } else {
        setStatus(
          "화면 분석 중 · 문구 미감지"
        );
      }
    } catch (error) {
      console.error("화면 분석 오류:", error);

      setStatus(
        "화면 분석 중 오류가 발생했어요."
      );
    } finally {
      busyRef.current = false;
    }
  };

  // 화면 공유 시작
  const start = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: 10,
          },
          audio: false,
        });

      streamRef.current = stream;

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      setSharing(true);

      setStatus(
        "화면 분석 중 · 문구 미감지"
      );

      stream
        .getVideoTracks()[0]
        .addEventListener("ended", stop);

      timerRef.current = setInterval(
        scan,
        intervalMs
      );
    } catch (error) {
      console.error("화면 공유 오류:", error);

      setStatus(
        "화면 공유가 취소되었거나 시작되지 않았어요."
      );
    }
  };

  // 화면 공유 중지
  function stop() {
    clearInterval(timerRef.current);

    timerRef.current = null;

    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setSharing(false);
    setFound(false);

    setStatus(
      "화면 공유를 중지했어요."
    );
  }

  // 알림음 테스트
  const testSound = () => {
    alertSound();
  };

  // 사용자 지정 음원 등록
  const handleCustomSound = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const url = URL.createObjectURL(file);

    setCustomSound(url);
  };

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <div className="logo">M</div>

          <div>
            <div className="brandTitle">
              MAPLE <span>ALERT</span>
            </div>

            <div className="sub">
              LIE DETECTOR · BETA
            </div>
          </div>
        </div>

        <div className="live">
          <i />
          LOCAL SCREEN ANALYSIS
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          MAPLESTORY COMPANION
        </div>

        <h1>
          test
          <br />
          <em>알림 도우미</em>
        </h1>

        <p>
          게임 화면에서 ‘거짓말 탐지기’ 문구를 찾으면
          <br />
          알림음으로 알려드려요.
        </p>

        <div className="actions">
          {!sharing ? (
            <button
              className="primary"
              disabled={!ocrReady}
              onClick={start}
            >
              ▣　화면 공유하고 시작
            </button>
          ) : (
            <button
              className="stop"
              onClick={stop}
            >
              ■　화면 공유 중지
            </button>
          )}

          <button
            className="secondary"
            onClick={testSound}
          >
            ♫　알림음 테스트
          </button>
        </div>

        <div className="status">
          <span
            className={
              found
                ? "dot found"
                : "dot"
            }
          />

          {status}
        </div>
      </section>

      <section className="grid">
        {/* 게임 화면 미리보기 */}
        <article className="panel preview">
          <div className="panelHead">
            <div>
              <small>01 / SCREEN</small>
              <h2>공유 화면</h2>
            </div>

            <span className="tag">
              {sharing
                ? "SHARING"
                : "STANDBY"}
            </span>
          </div>

          <div className="screen">
            <video
              ref={videoRef}
              muted
              playsInline
            />

            <div
              className="empty"
              style={{
                display: sharing
                  ? "none"
                  : "flex",
              }}
            >
              <div className="screenIcon">
                ▧
              </div>

              <b>
                게임 화면 미리보기
              </b>

              <span>
                화면 공유를 시작하면
                이곳에 표시됩니다.
              </span>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="hiddenCanvas"
          />

          <p className="hint">
            브라우저 화면 공유 권한을 허용하고
            메이플스토리 창을 선택하세요.
          </p>
        </article>

        {/* 감지 및 알림 설정 */}
        <article className="panel settings">
          <div className="panelHead">
            <div>
              <small>02 / DETECTION</small>
              <h2>감지 설정</h2>
            </div>

            <span className="tag green">
              OCR {ocrReady ? "READY" : "LOADING"}
            </span>
          </div>

          <div className="settingRow">
            <div>
              <b>감지 키워드</b>
              <p>화면에서 찾을 문구</p>
            </div>

            <strong className="keyword">
              {KEYWORD}
            </strong>
          </div>

          <div className="settingRow">
            <div>
              <b>검사 간격</b>
              <p>화면을 확인하는 주기</p>
            </div>

            <select
              value={intervalMs}
              onChange={(e) =>
                setIntervalMs(
                  Number(e.target.value)
                )
              }
              disabled={sharing}
            >
              <option value={1000}>1초</option>
              <option value={1800}>1.8초</option>
              <option value={3000}>3초</option>
            </select>
          </div>

          <div className="settingRow">
            <div>
              <b>알림음</b>
              <p>문구 감지 시 소리 재생</p>
            </div>

            <button
              className={
                "toggle " +
                (sound ? "on" : "")
              }
              onClick={() =>
                setSound((prev) => !prev)
              }
            >
              <span />
            </button>
          </div>

          <div className="settingRow">
            <div>
              <b>알림음 종류</b>
              <p>감지 시 재생할 소리</p>
            </div>

            <select
              value={soundType}
              onChange={(e) =>
                setSoundType(e.target.value)
              }
            >
              <option value="bell">
                기본 종소리
              </option>

              <option value="warning">
                경고음
              </option>

              <option value="voice">
                음성 알림
              </option>

              <option value="custom">
                사용자 지정
              </option>
            </select>
          </div>

          <div className="settingRow">
            <div>
              <b>알림음 볼륨</b>
              <p>{volume}%</p>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) =>
                setVolume(
                  Number(e.target.value)
                )
              }
            />
          </div>

          <div className="settingRow">
            <div>
              <b>반복 횟수</b>
              <p>알림음 재생 횟수</p>
            </div>

            <select
              value={repeatCount}
              onChange={(e) =>
                setRepeatCount(
                  Number(e.target.value)
                )
              }
            >
              <option value={1}>1회</option>
              <option value={3}>3회</option>
              <option value={5}>5회</option>
            </select>
          </div>

          {soundType === "custom" && (
            <div className="settingRow">
              <div>
                <b>사용자 지정 음원</b>
                <p>MP3 또는 WAV 파일</p>
              </div>

              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/mpeg"
                onChange={handleCustomSound}
              />
            </div>
          )}

          <div className="note">
            ※ 중복 알림 방지를 위해 감지 후
            10초 동안 재알림을 막아요.
          </div>
        </article>

        {/* 감지 이력 */}
        <article className="panel logs">
          <div className="panelHead">
            <div>
              <small>03 / ACTIVITY</small>
              <h2>최근 감지</h2>
            </div>

            <span className="tag">
              {logs.length} EVENTS
            </span>
          </div>

          {logs.length ? (
            logs.map((log, index) => (
              <div
                className="logRow"
                key={index}
              >
                <span className="logIcon">
                  ♫
                </span>

                <div>
                  <b>{log.message}</b>
                  <small>{log.time}</small>
                </div>

                <span className="detected">
                  DETECTED
                </span>
              </div>
            ))
          ) : (
            <div className="noLogs">
              <span>◷</span>

              <b>
                아직 감지 기록이 없어요
              </b>

              <p>
                게임 화면 공유 후
                감지를 시작합니다.
              </p>
            </div>
          )}
        </article>

        {/* OCR 결과 */}
        <article className="panel recognition">
          <div className="panelHead">
            <div>
              <small>04 / OCR OUTPUT</small>
              <h2>인식 결과</h2>
            </div>

            <span className="tag">
              LIVE TEXT
            </span>
          </div>

          <div className="ocrText">
            {latestText}
          </div>

          <p className="hint">
            화면에 표시된 글자를 OCR로 읽습니다.
            게임 이펙트나 해상도에 따라
            인식이 놓칠 수 있어요.
          </p>
        </article>
      </section>

      <footer>
        <span>
          MAPLE ALERT · PERSONAL TOOL
        </span>

        <span>
          게임 입력 / 자동 풀이 없음
        </span>
      </footer>
    </main>
  );
}
