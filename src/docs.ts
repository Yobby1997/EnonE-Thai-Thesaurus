const repositoryUrl = "https://github.com/Yobby1997/EnonE-Thai-Thesaurus";
const apiUrl = "https://enone-thai-thesaurus.onrender.com/api/v1/suggestions";

export const docsHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="คู่มือใช้งาน API และร่วมเพิ่มคำใน EnonE Thai Thesaurus">
  <title>EnonE Thai Thesaurus — คู่มือใช้งาน</title>
  <style>
    :root { color-scheme: light dark; --bg:#f4f1eb; --paper:#fffdf9; --ink:#211d18; --muted:#6e665d; --line:#d8d0c5; --accent:#8b4b20; --soft:#eee7dd; }
    @media (prefers-color-scheme:dark) { :root { --bg:#171513; --paper:#211e1b; --ink:#f5efe7; --muted:#b9afa4; --line:#443d36; --accent:#efb17e; --soft:#2c2824; } }
    * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif; line-height:1.7 }
    a { color:var(--accent) } header,main,footer { width:min(920px,calc(100% - 32px)); margin:auto } header { padding:64px 0 28px } main { display:grid; gap:20px; padding-bottom:52px }
    h1 { margin:0 0 10px; font-size:clamp(2rem,6vw,4rem); line-height:1.08; letter-spacing:-.04em } h2 { margin:0 0 12px; font-size:1.35rem } h3 { margin:22px 0 8px } p { margin:8px 0 } .lead { max-width:700px; color:var(--muted); font-size:1.08rem }
    .card { padding:24px; border:1px solid var(--line); border-radius:18px; background:var(--paper) } .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px }
    code,pre { font-family:ui-monospace,SFMono-Regular,Consolas,monospace } code { font-size:.92em } pre { overflow:auto; padding:16px; border-radius:12px; background:var(--soft); line-height:1.55; white-space:pre-wrap }
    .button { display:inline-block; margin:12px 8px 0 0; padding:10px 16px; border:1px solid var(--ink); border-radius:999px; background:var(--ink); color:var(--paper); font-weight:700; text-decoration:none }
    .button.secondary { background:transparent; color:var(--ink) } .flow { margin:0; padding-left:22px } .tag { display:inline-block; padding:1px 8px; border:1px solid var(--line); border-radius:999px; font-size:.8rem }
    .notice { border-left:4px solid var(--accent) } footer { padding:0 0 44px; color:var(--muted); font-size:.9rem }
  </style>
</head>
<body>
  <header>
    <span class="tag">ไม่ใช้ AI · REST API · MIT</span>
    <h1>EnonE Thai Thesaurus</h1>
    <p class="lead">คลังคำใกล้เคียงภาษาไทยสำหรับเว็บและโปรแกรมบนคอมพิวเตอร์ พร้อมชนิดคำและระดับภาษา เรียงจากระดับต่ำไปสูง</p>
    <a class="button" href="#use">เริ่มใช้งาน</a>
    <a class="button secondary" href="#contribute">ช่วยเพิ่มคำ</a>
  </header>
  <main>
    <section id="use" class="card">
      <h2>เรียกใช้ API</h2>
      <p>ส่งคำภาษาไทยในพารามิเตอร์ <code>word</code> และเข้ารหัสด้วย <code>encodeURIComponent</code> เสมอ</p>
      <pre>GET ${apiUrl}?word=ลอง</pre>
      <h3>JavaScript — ใช้ได้ทั้งเว็บและ Node.js</h3>
      <pre>const word = "ลอง";
const response = await fetch(
  "${apiUrl}?word=" + encodeURIComponent(word)
);
if (!response.ok) throw new Error("API " + response.status);
const data = await response.json();
console.log(data.suggestions);</pre>
      <h3>ตัวอย่างผลลัพธ์</h3>
      <pre>{
  "word": "ลอง",
  "suggestions": [
    { "word": "ลองดู", "pos": ["ก."], "register": "ภาษาพูด", "registerRank": 2 }
  ]
}</pre>
      <div class="grid">
        <div><h3>ชนิดคำ</h3><p><span class="tag">น.</span> นาม &nbsp; <span class="tag">ก.</span> กริยา &nbsp; <span class="tag">ว.</span> วิเศษณ์</p></div>
        <div><h3>ลำดับระดับภาษา</h3><p>เรียงด้วย <code>registerRank</code> จากน้อยไปมาก: หยาบ → ภาษาพูด → ทั่วไป → กึ่งทางการ → ทางการ → วรรณกรรม → พระสงฆ์ → ราชาศัพท์</p></div>
      </div>
      <p>API สาธารณะจำกัดจำนวนคำขอต่อผู้ใช้ และเซิร์ฟเวอร์ฟรีอาจใช้เวลาตื่นหลังไม่มีการใช้งาน โปรด cache เฉพาะผลที่มีคำแนะนำเป็นเวลา 1–5 นาที</p>
    </section>

    <section id="contribute" class="card">
      <h2>ช่วยเพิ่มหรือแก้ไขคำ</h2>
      <p>ไม่ต้องดาวน์โหลดฐานข้อมูลและไม่ต้อง commit ไฟล์โดยตรง ให้ส่งข้อเสนอผ่านแบบฟอร์ม GitHub เพื่อป้องกันสำเนาเก่าทับข้อมูลใหม่</p>
      <ol class="flow">
        <li>ค้นคำจาก API ก่อนว่ามีอยู่แล้วหรือไม่</li>
        <li>เปิดแบบฟอร์ม แล้วระบุคำตั้ง คำใกล้เคียง ชนิดคำ และระดับภาษา</li>
        <li>ยกตัวอย่างประโยคสั้น ๆ เพื่อช่วยแยกความหมายของคำ</li>
        <li>ผู้ดูแลตรวจคำซ้ำ ความหมาย ชนิดคำ และระดับภาษา</li>
        <li>เมื่อผ่านการตรวจ ผู้ดูแลจึงรวมข้อมูลเข้าคลังกลางและรันชุดทดสอบ</li>
      </ol>
      <a class="button" href="${repositoryUrl}/issues/new?template=suggest-word.yml">เสนอคำใหม่</a>
      <a class="button secondary" href="${repositoryUrl}/issues">ดูข้อเสนอทั้งหมด</a>
    </section>

    <section class="card notice">
      <h2>ทำไมไม่รับไฟล์ฐานข้อมูลจากแต่ละเครื่องโดยตรง?</h2>
      <p>การส่งไฟล์ทั้งก้อนทำให้ข้อมูลจากเครื่องที่ยังไม่ได้อัปเดตสามารถลบหรือย้อนข้อมูลล่าสุดได้ ระบบข้อเสนอจึงรับเฉพาะ “การเปลี่ยนแปลงหนึ่งรายการ” มีหมายเลขติดตามและประวัติการตัดสินใจ ส่วนคลังกลางจะถูกแก้หลังผ่านรีวิวเท่านั้น</p>
    </section>

    <section class="card">
      <h2>หลักเกณฑ์ของคำใกล้เคียง</h2>
      <ul>
        <li>ต้องใช้แทนกันได้อย่างน้อยหนึ่งบริบท ไม่ใช่เพียงอยู่ในหัวข้อเดียวกัน</li>
        <li>อย่าใส่คำตรงข้าม คำที่กว้างกว่า หรือคำที่แคบกว่าโดยไม่มีเหตุผลชัดเจน</li>
        <li>คำหนึ่งคำอาจมีหลายชนิดคำ แต่ความสัมพันธ์แต่ละคู่ต้องระบุชนิดที่ใช้จริง</li>
        <li>ระดับภาษาบอกลักษณะการใช้ของคำ ไม่ได้บอกว่าคำใดดีกว่าคำใด</li>
        <li>อย่าคัดลอกข้อมูลจากพจนานุกรมหรือฐานข้อมูลที่ไม่อนุญาตให้นำมาเผยแพร่ต่อ</li>
      </ul>
    </section>
  </main>
  <footer>EnonE Thai Thesaurus · <a href="${repositoryUrl}">ซอร์สโค้ดและสัญญาอนุญาต</a> · <a href="/health">สถานะ API</a></footer>
</body>
</html>`;
