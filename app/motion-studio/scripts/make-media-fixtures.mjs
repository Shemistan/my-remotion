#!/usr/bin/env node
// Тестовые медиа Task 25 (импорт видео): ffmpeg + `say -v Milena` → `tmp/media-fixtures/`
// репозитория. В git — только этот скрипт; файлы пересоздаются (`--force` — заново).
//   talk-ru-cfr.mp4  1280×720, 30/1, testsrc2 + речь с паузами [[slnc 1500]], ≈ 20 с
//   «Запись экрана 1.mp4»  копия cfr: кириллица и пробел в имени (UI-e2e импорта, ревью Task 29 C1)
//   talk-ru-vfr.mov  части 25 и 30 fps, склейка concat-демуксером `-c copy`
//   rotated.mov      копия cfr с `-display_rotation 90`
//   no-audio.mp4     только видео
//   broken.mp4       обрезанный cfr (moov в конце — файл не открывается)
//   talk-ru-takes.mp4  черновой монтаж (Task 28): фальстарт, неудачный дубль, «ну вот, как бы», ≈ 16 с
//   cuts-3.mp4       анализ видеоряда (Task 30): три сцены по 4 с (testsrc2, smptebars, mandelbrot), тон
//   counter-30.mp4, delayed-audio.mp4, louder.mp4, final-like.mp4 (+ -edited.wav, -ref.mkv),
//   counter-30-16k.wav, still-30.mp4 — проверка финала (Task 44, server/test/fixtures/final/README.md)
//   audio-long.mp4   звук длиннее видео на 40 мс, как у iPhone (master Task 36, ревью I1): 5,00 с видео, 5,04 с звука
//   hdr-hlg.mp4      теги HDR HLG / BT.2020 (master отказывает hdr_unsupported, ревью I2), 1 с
// `--ffprobe-fixtures` — ещё и JSON ffprobe cfr/vfr/rotated/no-audio в
// `app/motion-studio/server/test/fixtures/ffprobe/` (пути очищены до имени файла).
// Печатает сводку ffprobe каждого файла. Без `say` речь заменяется тоном (отмечается в выводе).
/* global process, URL, console */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = join(REPO, "tmp/media-fixtures");
const FFPROBE_OUT = fileURLToPath(new URL("../server/test/fixtures/ffprobe/", import.meta.url));
const force = process.argv.includes("--force");
const writeProbes = process.argv.includes("--ffprobe-fixtures");

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
const ff = (args) => run("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
const p = (name) => join(OUT, name);

mkdirSync(OUT, { recursive: true });

const SPEECH = [
  "Привет! Сегодня я расскажу, как мы выросли до миллиона пользователей.",
  "[[slnc 1500]] Сначала мы проверили гипотезу на десяти клиентах.",
  "[[slnc 1500]] Потом, э-э, мы удвоили выручку за полгода.",
  "[[slnc 1500]] И главное: команда из пяти человек сделала это без инвестиций.",
].join(" ");

function speech() {
  const aiff = p("speech.aiff");
  if (existsSync(aiff) && !force) return { file: aiff, voice: true };
  try {
    run("say", ["-v", "Milena", "-o", aiff, SPEECH]);
    return { file: aiff, voice: true };
  } catch (e) {
    console.warn(`say -v Milena недоступен (${e.message.split("\n")[0]}): речь заменена тоном 440 Гц`);
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=20", "-ar", "22050", aiff]);
    return { file: aiff, voice: false };
  }
}

function make(name, build) {
  if (existsSync(p(name)) && !force) return;
  rmSync(p(name), { force: true });
  build(p(name));
}

const sp = speech();
const DUR = "20";

make("talk-ru-cfr.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
  "-i", sp.file,
  "-t", DUR, "-af", "apad", "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "60",
  "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "1",
  out,
]));

make("Запись экрана 1.mp4", (out) => copyFileSync(p("talk-ru-cfr.mp4"), out));

make("talk-ru-vfr.mov", (out) => {
  const parts = [["part-25.mov", 25, 0], ["part-30.mov", 30, 10]];
  for (const [name, fps, ss] of parts) {
    ff([
      "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=${fps}`,
      "-ss", String(ss), "-i", sp.file,
      "-t", "10", "-af", "apad", "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-video_track_timescale", "15000",
      "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "1",
      p(name),
    ]);
  }
  const list = p("vfr-concat.txt");
  writeFileSync(list, parts.map(([name]) => `file '${p(name)}'`).join("\n") + "\n");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  for (const [name] of parts) rmSync(p(name), { force: true });
  rmSync(list, { force: true });
});

make("rotated.mov", (out) => ff(["-display_rotation", "90", "-i", p("talk-ru-cfr.mp4"), "-c", "copy", out]));

make("no-audio.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "5",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", out,
]));

// Синхронность A/V (ревью I1): белая вспышка 1 кадр и щелчок-тон 100 мс в один момент файла —
// 3,0 с; в av-vlate видео начинается на 0,5 с позже звука (`-itsoffset 0.5`), в av-alate — звук.
const FLASH = (at) => `color=c=black:size=640x360:rate=30,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,${at},${at + 0.03})'`;
const BEEP = (at) => `sine=frequency=1000:sample_rate=48000,volume=enable='not(between(t,${at},${at + 0.1}))':volume=0`;
const AV = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "1"];
make("av-vlate.mp4", (out) => ff([
  "-itsoffset", "0.5", "-f", "lavfi", "-t", "5.5", "-i", FLASH(2.5),
  "-f", "lavfi", "-t", "6", "-i", BEEP(3), "-map", "0:v", "-map", "1:a", ...AV, out,
]));
make("av-alate.mp4", (out) => ff([
  "-f", "lavfi", "-t", "6", "-i", FLASH(3),
  "-itsoffset", "0.5", "-f", "lavfi", "-t", "5.5", "-i", BEEP(2.5), "-map", "0:v", "-map", "1:a", ...AV, out,
]));

// Черновой монтаж (Task 28): фальстарт, оборванный и повторённый дубль, пустые «ну вот, как бы».
const TAKES = [
  "Мы в прошлом [[slnc 400]] Мы в прошлом году запустили сервис доставки.",
  "[[slnc 900]] Ну вот, как бы, первые заказы пришли через неделю.",
  "[[slnc 900]] Главное, что мы поняли, это то что [[slnc 500]] Главное, что мы поняли: клиентам важна скорость.",
].join(" ");
make("talk-ru-takes.mp4", (out) => {
  const aiff = p("takes.aiff");
  try {
    run("say", ["-v", "Milena", "-o", aiff, TAKES]);
  } catch (e) {
    console.warn(`say -v Milena недоступен (${e.message.split("\n")[0]}): talk-ru-takes — тон 440 Гц`);
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=16", "-ar", "22050", aiff]);
  }
  ff([
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-i", aiff,
    "-af", "apad=pad_dur=1", "-shortest", "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "60",
    "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "1", out,
  ]);
  rmSync(aiff, { force: true });
});

// Анализ видеоряда (Task 30): жёсткие смены сцен на 4 и 8 с, лиц нет.
make("cuts-3.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4", "-f", "lavfi", "-i", "smptebars=size=1280x720:rate=30:duration=4",
  "-f", "lavfi", "-i", "mandelbrot=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=12",
  "-filter_complex", "[2:v]trim=duration=4,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1:a=0,fps=30,settb=1/30[v]",
  "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "60",
  "-c:a", "aac", "-b:a", "96k", "-ac", "1", out,
]));

// Проверка финала (Task 44, `server/test/fixtures/final/README.md`): исходник 640×360, 30/1, 10 с —
// testsrc2 (движущийся узор: каждый кадр свой) и «слова» розового шума (0,35 с звук, 0,35 с тишина,
// seed закреплён: корреляция однозначна, в отличие от тона). Он же — master (CFR, `-g` = 1 с).
const NOISE = "anoisesrc=d=10:c=pink:a=0.25:r=48000:s=44,volume=volume=0:enable='gte(mod(t,0.7),0.35)'";
const FINAL_A = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1"];
const FINAL_V = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-g", "30"];
make("counter-30.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=10", "-f", "lavfi", "-i", NOISE,
  "-map", "0:v", "-map", "1:a", ...FINAL_V, "-crf", "12", ...FINAL_A, "-movflags", "+faststart", out,
]));
// Звук того же ролика, задержанный на 66 мс (2 кадра 30 fps) — рассинхрон.
make("delayed-audio.mp4", (out) => ff([
  "-i", p("counter-30.mp4"), "-map", "0:v", "-map", "0:a", "-c:v", "copy",
  "-af", "adelay=delays=66:all=1,atrim=end=10", ...FINAL_A, out,
]));
// Звук на 3 дБ громче.
make("louder.mp4", (out) => ff(["-i", p("counter-30.mp4"), "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", "volume=3dB", ...FINAL_A, out]));
// Звук исходника 16 кГц моно (как `source16k` Phase 2) — опора синхронности.
make("counter-30-16k.wav", (out) => ff(["-i", p("counter-30.mp4"), "-map", "0:a", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out]));
// «Финал»: вырезан исходник [3 с, 4 с) (кадры 90–119), на кадрах финала 150–239 — прямоугольник
// «сцены». Рядом — смонтированный звук 48 кГц (edited-audio) и эталон сцены без потерь (still).
const CUT_V = "[0:v]split[v0][v1];[v0]trim=end_frame=90,setpts=PTS-STARTPTS[va];[v1]trim=start_frame=120,setpts=PTS-STARTPTS[vb];" +
  "[va][vb]concat=n=2:v=1:a=0,fps=30,settb=1/30,drawbox=x=iw*0.55:y=ih*0.1:w=iw*0.4:h=ih*0.5:color=orange@1:t=fill:enable='between(n,150,239)'[v]";
const CUT_A = "[0:a]asplit[a0][a1];[a0]atrim=end=3,asetpts=PTS-STARTPTS[aa];[a1]atrim=start=4,asetpts=PTS-STARTPTS[ab];[aa][ab]concat=n=2:v=0:a=1[a]";
make("final-like-edited.wav", (out) => ff(["-i", p("counter-30.mp4"), "-filter_complex", CUT_A, "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "48000", out]));
make("final-like.mp4", (out) => ff([
  "-i", p("counter-30.mp4"), "-filter_complex", `${CUT_V};${CUT_A}`, "-map", "[v]", "-map", "[a]",
  ...FINAL_V, "-crf", "18", ...FINAL_A, "-movflags", "+faststart", out,
]));
// Эталон still — как рендер Remotion: master декодирован в RGB (bt601, TV-диапазон), прямоугольник
// нарисован в RGB, FFV1 без потерь в RGB (fix 1: сверка RGB-still с финалом yuv420p по Y).
const CUT_V_RGB = CUT_V.replace("fps=30,settb=1/30,drawbox", "fps=30,settb=1/30,scale=in_color_matrix=bt601:in_range=tv,format=rgb24,drawbox");
make("final-like-ref.mkv", (out) => ff(["-i", p("counter-30.mp4"), "-filter_complex", CUT_V_RGB, "-map", "[v]", "-c:v", "ffv1", "-pix_fmt", "bgr0", out]));
// Неподвижный кадр 2 с: выравнивание по нему не определено (`inconclusive`).
make("still-30.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=1:duration=2", "-vf", "fps=30,trim=duration=2",
  ...FINAL_V, "-crf", "12", out,
]));

// master (Task 36, ревью I1): у iPhone звук длиннее видео на 10–40 мс — после конца видео кадры
// master должны повторять последний до конца звука.
make("audio-long.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=5.04",
  "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-g", "60",
  "-c:a", "aac", "-b:a", "96k", "-ac", "1", out,
]));

// HDR (ревью I2): только теги HLG / BT.2020 (ffmpeg 7: x264 берёт primaries/trc из кадра — setparams).
make("hdr-hlg.mp4", (out) => ff([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=1",
  "-vf", "setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-colorspace", "bt2020nc", out,
]));

make("broken.mp4", (out) => {
  const buf = readFileSync(p("talk-ru-cfr.mp4"));
  writeFileSync(out, buf.subarray(0, Math.floor(buf.length * 0.4)));
});

function probeJson(file) {
  return JSON.parse(run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]));
}

const summary = [];
for (const name of ["talk-ru-cfr.mp4", "talk-ru-vfr.mov", "rotated.mov", "no-audio.mp4", "av-vlate.mp4", "av-alate.mp4", "talk-ru-takes.mp4", "cuts-3.mp4", "counter-30.mp4", "delayed-audio.mp4", "louder.mp4", "final-like.mp4", "still-30.mp4", "audio-long.mp4", "hdr-hlg.mp4", "broken.mp4"]) {
  let line;
  try {
    const j = probeJson(p(name));
    const v = j.streams.find((s) => s.codec_type === "video");
    const a = j.streams.find((s) => s.codec_type === "audio");
    const rot = v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0;
    line = `${v.codec_name} ${v.width}×${v.height} r=${v.r_frame_rate} avg=${v.avg_frame_rate} rot=${rot} ` +
      `${a ? `${a.codec_name} ${a.sample_rate} Гц` : "без звука"}, ${Number(j.format.duration).toFixed(2)} с`;
  } catch (e) {
    line = `ffprobe: ошибка (${String(e.stderr ?? e.message).trim().split("\n")[0]})`;
  }
  summary.push(`${name.padEnd(17)} ${(statSync(p(name)).size / 1024).toFixed(0).padStart(6)} КиБ  ${line}`);
}
console.log(`tmp/media-fixtures/ (${sp.voice ? "речь say -v Milena" : "тон вместо речи"}):`);
console.log(summary.join("\n"));

if (writeProbes) {
  mkdirSync(FFPROBE_OUT, { recursive: true });
  const map = { cfr: "talk-ru-cfr.mp4", vfr: "talk-ru-vfr.mov", rotated: "rotated.mov", "no-audio": "no-audio.mp4" };
  for (const [key, name] of Object.entries(map)) {
    const j = probeJson(p(name));
    // путь к файлу — только имя (без /Users/…)
    j.format.filename = basename(j.format.filename);
    writeFileSync(join(FFPROBE_OUT, `${key}.json`), JSON.stringify(j, null, 2) + "\n");
  }
  console.log(`ffprobe JSON → ${FFPROBE_OUT}`);
}
