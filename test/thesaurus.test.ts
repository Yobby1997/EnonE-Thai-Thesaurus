import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ThaiThesaurus } from "../src/thesaurus.js";
import { REGISTERS, type ThesaurusData } from "../src/types.js";

const data = JSON.parse(await readFile("data/thesaurus.json", "utf8")) as ThesaurusData;
const thesaurus = new ThaiThesaurus(data);
const registerOverridesRaw = await readFile("data/register-overrides.json", "utf8");
const editorialEntries = JSON.parse(await readFile("data/editorial-entries.json", "utf8")) as Array<{ word: string }>;

test("returns no suggestions for unknown words", () => {
  assert.deepEqual(thesaurus.suggest("ไม่มีคำนี้"), []);
});

test("sorts suggestions from low to high register", () => {
  assert.deepEqual(
    thesaurus.suggest("กิน").map(({ word }) => word),
    ["แดก", "ซัด", "ทาน", "รับประทาน", "บริโภค", "ลิ้ม", "ฉัน", "เสวย"]
  );
});

test("supports POS filtering", () => {
  assert.ok(thesaurus.suggest("กิน", "ก.").every(({ pos }) => pos.includes("ก.")));
});

test("editorial food sense excludes drinking relations", () => {
  const words = thesaurus.suggest("กิน").map(({ word }) => word);
  assert.ok(!words.includes("ดื่ม"));
  assert.ok(!words.includes("กินเหล้า"));
});

test("editorial relation supplies the context POS", () => {
  const suggestions = thesaurus.suggest("โกย");
  assert.deepEqual(suggestions.map(({ word }) => word), ["กวาด", "ขน", "คว้า", "ตัก", "รวบ"]);
  assert.ok(suggestions.every(({ pos }) => pos.length === 1 && pos[0] === "ก."));
});

test("sleep sense excludes sexual WordNet relations", () => {
  const words = thesaurus.suggest("นอน").map(({ word }) => word);
  assert.ok(!words.includes("ปี้"));
  assert.ok(!words.includes("มีเพศสัมพันธ์"));
});

test("adjective sense excludes homonymous nouns", () => {
  const words = thesaurus.suggest("ดี").map(({ word }) => word);
  assert.ok(!words.includes("ถุงน้ำดี"));
  assert.ok(!words.includes("พระปิตตะ"));
});

test("family and architecture editorial senses exclude noisy mappings", () => {
  assert.ok(!thesaurus.suggest("พ่อ").some(({ word }) => word === "เจ้าหนุ่ม"));
  assert.ok(!thesaurus.suggest("หน้าต่าง").some(({ word }) => word === "รู"));
});

test("body vocabulary rises from common to royal register", () => {
  assert.deepEqual(
    thesaurus.suggest("ตา").map(({ word, register }) => [word, register]),
    [
      ["ดวงตา", "ทั่วไป"],
      ["นัยน์ตา", "วรรณกรรม"],
      ["เนตร", "วรรณกรรม"],
      ["พระเนตร", "ราชาศัพท์"]
    ]
  );
});

test("combat verb sense excludes homonymous body-part relations", () => {
  const words = thesaurus.suggest("ฟัน").map(({ word }) => word);
  assert.ok(!words.includes("เขี้ยว"));
  assert.ok(!words.includes("พระทนต์"));
  assert.deepEqual(words, ["เฉือน", "สับ", "จาม"]);
});

test("register override keys are unique", () => {
  const keys = [...registerOverridesRaw.matchAll(/"([^"]+)"\s*:/gu)].map((match) => match[1]);
  assert.equal(new Set(keys).size, keys.length);
});

test("editorial headwords are unique", () => {
  const words = editorialEntries.map(({ word }) => word);
  assert.equal(new Set(words).size, words.length);
});

test("all curated synonym targets resolve and ranks match registers", () => {
  for (const entry of data.entries) {
    assert.equal(entry.registerRank, REGISTERS.indexOf(entry.register) + 1, entry.word);
    for (const synonym of entry.synonyms) {
      assert.ok(thesaurus.has(synonym), `${entry.word} -> ${synonym}`);
    }
  }
});

test("every suggestion list is ordered from lower to higher register", () => {
  for (const entry of data.entries) {
    const ranks = thesaurus.suggest(entry.word).map(({ registerRank }) => registerRank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), entry.word);
  }
});

test("insulting intelligence terms remain visibly low-register", () => {
  const suggestions = thesaurus.suggest("โง่");
  assert.equal(suggestions[0]?.word, "งี่เง่า");
  assert.equal(suggestions[0]?.register, "หยาบ");
  assert.equal(suggestions.at(-1)?.word, "เขลา");
  assert.equal(suggestions.at(-1)?.register, "วรรณกรรม");
});

test("royal role variants carry the royal register", () => {
  assert.ok(
    thesaurus.suggest("กษัตริย์").every(({ word, register }) =>
      !word.startsWith("พระ") || register === "ราชาศัพท์"
    )
  );
});

test("spouse editorial senses do not become opposites", () => {
  assert.ok(!thesaurus.suggest("สามี").some(({ word }) => word === "ภรรยา"));
  assert.ok(!thesaurus.suggest("ภรรยา").some(({ word }) => word === "สามี"));
});

test("exterior walls and interior walls remain separate senses", () => {
  assert.ok(!thesaurus.suggest("กำแพง").some(({ word }) => word === "ผนัง"));
  assert.ok(!thesaurus.suggest("ผนัง").some(({ word }) => word === "กำแพง"));
});

test("royal rooms and vehicles carry the royal register", () => {
  assert.deepEqual(thesaurus.suggest("ห้องนอน").map(({ word, register }) => [word, register]), [
    ["ห้องบรรทม", "ราชาศัพท์"]
  ]);
  assert.deepEqual(thesaurus.suggest("รถม้า").map(({ word, register }) => [word, register]), [
    ["ราชรถ", "ราชาศัพท์"]
  ]);
});

test("food and staple-rice senses stay separate", () => {
  assert.ok(!thesaurus.suggest("อาหาร").some(({ word }) => word === "ข้าว"));
  assert.ok(!thesaurus.suggest("ข้าว").some(({ word }) => word === "อาหาร"));
});

test("curated drinking sense excludes generic eating", () => {
  assert.ok(!thesaurus.suggest("ดื่ม").some(({ word }) => word === "กิน"));
});

test("royal clothing and jewelry variants carry royal register", () => {
  for (const word of ["เสื้อผ้า", "รองเท้า", "แหวน", "ต่างหู"]) {
    for (const suggestion of thesaurus.suggest(word)) {
      if (suggestion.word.startsWith("พระ") || suggestion.word.startsWith("ฉลองพระ")) {
        assert.equal(suggestion.register, "ราชาศัพท์", `${word} -> ${suggestion.word}`);
      }
    }
  }
});

test("editorial headwords are not polluted by reverse candidate relations", () => {
  assert.ok(!thesaurus.suggest("ชม").some(({ word }) => word === "ดู"));
  assert.ok(!thesaurus.suggest("นอน").some(({ word }) => word === "ปี้"));
});

test("royal communication verbs carry royal register", () => {
  for (const word of ["เขียน", "ถาม", "ตอบ", "สั่ง", "ขอ"]) {
    for (const suggestion of thesaurus.suggest(word)) {
      if (suggestion.word.includes("พระ") || suggestion.word.startsWith("ทูล") || suggestion.word === "รับสั่ง") {
        assert.equal(suggestion.register, "ราชาศัพท์", `${word} -> ${suggestion.word}`);
      }
    }
  }
});

test("agreement and rejection remain separate choices", () => {
  assert.ok(!thesaurus.suggest("ยอมรับ").some(({ word }) => word === "ปฏิเสธ"));
  assert.ok(!thesaurus.suggest("เห็นด้วย").some(({ word }) => word === "คัดค้าน"));
});

test("price adjective sense is isolated from correctness senses", () => {
  const words = thesaurus.suggest("ถูก").map(({ word }) => word);
  assert.deepEqual(words, ["ราคาถูก", "ย่อมเยา"]);
});

test("theft and robbery remain separate legal senses", () => {
  assert.ok(!thesaurus.suggest("ขโมย").some(({ word }) => word === "ปล้น"));
  assert.ok(!thesaurus.suggest("ปล้น").some(({ word }) => word === "ขโมย"));
});

test("murder sense excludes unrelated slang mappings", () => {
  const words = thesaurus.suggest("ฆาตกรรม").map(({ word }) => word);
  assert.ok(!words.includes("เก็บ"));
  assert.ok(!words.includes("ยิงทิ้ง"));
});

test("formal legal terms do not fall below formal register", () => {
  for (const word of ["ชิงทรัพย์", "ฉ้อโกง", "ความผิดอาญา", "เรือนจำ", "ดำเนินคดี"]) {
    const entry = data.entries.find((candidate) => candidate.word === word);
    assert.ok(entry && entry.registerRank >= 5, word);
  }
});

test("ghosts and demons remain distinct creature senses", () => {
  assert.ok(!thesaurus.suggest("ผี").some(({ word }) => word === "ปีศาจ"));
  assert.ok(!thesaurus.suggest("ปีศาจ").some(({ word }) => word === "ผี"));
});

test("gods and angels remain distinct creature senses", () => {
  assert.ok(!thesaurus.suggest("เทพเจ้า").some(({ word }) => word === "เทวดา"));
  assert.ok(!thesaurus.suggest("เทวดา").some(({ word }) => word === "เทพเจ้า"));
});

test("reviving oneself and reviving another remain separate", () => {
  assert.ok(!thesaurus.suggest("ฟื้นคืนชีพ").some(({ word }) => word === "ชุบชีวิต"));
  assert.ok(!thesaurus.suggest("ชุบชีวิต").some(({ word }) => word === "ฟื้นคืนชีพ"));
});

test("fantasy spell vocabulary retains literary register", () => {
  for (const word of ["เวท", "มนตรา", "อาคม", "ร่ายเวท", "ร่ายมนตร์", "บริกรรมคาถา"]) {
    const entry = data.entries.find((candidate) => candidate.word === word);
    assert.equal(entry?.register, "วรรณกรรม", word);
  }
});

test("battle events and battle locations remain separate", () => {
  assert.ok(!thesaurus.suggest("การรบ").some(({ word }) => word === "สนามรบ"));
  assert.ok(!thesaurus.suggest("สนามรบ").some(({ word }) => word === "การรบ"));
});

test("victory and defeat remain separate concepts", () => {
  assert.ok(!thesaurus.suggest("ชัยชนะ").some(({ word }) => word === "ความพ่ายแพ้"));
  assert.ok(!thesaurus.suggest("ความพ่ายแพ้").some(({ word }) => word === "ชัยชนะ"));
});

test("military operational terms retain formal-or-higher register", () => {
  for (const word of ["ยุทธวิธี", "ยุทธศาสตร์", "ถอนกำลัง", "ปิดล้อม", "ลอบโจมตี", "ข่าวกรอง"]) {
    const entry = data.entries.find((candidate) => candidate.word === word);
    assert.ok(entry && entry.registerRank >= 5, word);
  }
});

test("war and peace remain separate concepts", () => {
  assert.ok(!thesaurus.suggest("สงคราม").some(({ word }) => word === "สันติภาพ"));
  assert.ok(!thesaurus.suggest("สันติภาพ").some(({ word }) => word === "สงคราม"));
});

test("temporal adverbs stay separate from temporal nouns", () => {
  assert.ok(!thesaurus.suggest("ตอนนี้").some(({ word }) => word === "ปัจจุบัน"));
  assert.ok(thesaurus.suggest("ตอนนี้").every(({ pos }) => pos.includes("ว.")));
});

test("opposite quantity and spatial directions remain separate", () => {
  assert.ok(!thesaurus.suggest("มาก").some(({ word }) => word === "น้อย"));
  assert.ok(!thesaurus.suggest("ข้างใน").some(({ word }) => word === "ข้างนอก"));
  assert.ok(!thesaurus.suggest("ข้างบน").some(({ word }) => word === "ข้างล่าง"));
});

test("conjunction suggestions preserve conjunction POS", () => {
  for (const word of ["แต่", "เพราะ", "ดังนั้น", "และ", "หรือ", "ถ้า", "แม้ว่า"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ส.")), word);
  }
});

test("connector variants are ordered from colloquial to formal or literary", () => {
  assert.deepEqual(thesaurus.suggest("แต่").map(({ registerRank }) => registerRank), [2, 5, 6]);
  assert.deepEqual(thesaurus.suggest("ถ้า").map(({ registerRank }) => registerRank), [2, 5, 5]);
});

test("staring and glancing remain distinct eye actions", () => {
  assert.ok(!thesaurus.suggest("จ้อง").some(({ word }) => word === "เหลือบ"));
  assert.ok(!thesaurus.suggest("เหลือบ").some(({ word }) => word === "จ้อง"));
});

test("jealousy and envy remain distinct emotions", () => {
  assert.ok(!thesaurus.suggest("หึง").some(({ word }) => word === "อิจฉา"));
  assert.ok(!thesaurus.suggest("อิจฉา").some(({ word }) => word === "หึง"));
});

test("royal body gestures retain royal register", () => {
  for (const [source, target] of [["ขมวดคิ้ว", "ขมวดพระขนง"], ["คุกเข่า", "คุกพระชานุ"]]) {
    const suggestion = thesaurus.suggest(source).find(({ word }) => word === target);
    assert.equal(suggestion?.register, "ราชาศัพท์", `${source} -> ${target}`);
  }
});

test("fine movement groups remain semantically separated", () => {
  assert.ok(!thesaurus.suggest("ย่อง").some(({ word }) => word === "คลาน"));
  assert.ok(!thesaurus.suggest("เซ").some(({ word }) => word === "กระโดด"));
});

test("general help and life-saving help remain separate", () => {
  assert.ok(!thesaurus.suggest("ช่วย").some(({ word }) => word === "ช่วยชีวิต"));
  assert.ok(!thesaurus.suggest("ช่วยชีวิต").some(({ word }) => word === "ช่วย"));
});

test("betrayal and deception remain separate relationship harms", () => {
  assert.ok(!thesaurus.suggest("ทรยศ").some(({ word }) => word === "หลอก"));
  assert.ok(!thesaurus.suggest("หลอก").some(({ word }) => word === "ทรยศ"));
});

test("disagreement and quarrelling remain separate conflict intensities", () => {
  assert.ok(!thesaurus.suggest("ขัดแย้ง").some(({ word }) => word === "ทะเลาะ"));
  assert.ok(!thesaurus.suggest("ทะเลาะ").some(({ word }) => word === "ขัดแย้ง"));
});

test("royal greeting, farewell, apology, and marriage retain royal register", () => {
  for (const [source, target] of [
    ["ต้อนรับ", "รับเสด็จ"],
    ["กล่าวลา", "ทูลลา"],
    ["ขอโทษ", "ทูลขอพระราชทานอภัย"],
    ["แต่งงาน", "อภิเษกสมรส"]
  ]) {
    const suggestion = thesaurus.suggest(source).find(({ word }) => word === target);
    assert.equal(suggestion?.register, "ราชาศัพท์", `${source} -> ${target}`);
  }
});

test("domestic animal groups remain distinct", () => {
  assert.ok(!thesaurus.suggest("หมา").some(({ word }) => word === "แมว"));
  assert.ok(!thesaurus.suggest("แมว").some(({ word }) => word === "หมา"));
});

test("general animals do not include monsters", () => {
  assert.ok(!thesaurus.suggest("สัตว์").some(({ word }) => word === "สัตว์ประหลาด"));
});

test("hunting and tracking remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("ล่า").some(({ word }) => word === "ตามรอย"));
  assert.ok(!thesaurus.suggest("ตามรอย").some(({ word }) => word === "ล่า"));
});

test("royal elephant term retains royal register", () => {
  const suggestion = thesaurus.suggest("ช้าง").find(({ word }) => word === "พระคชาธาร");
  assert.equal(suggestion?.register, "ราชาศัพท์");
});

test("rivers, streams, coasts, and beaches remain distinct terrain", () => {
  assert.ok(!thesaurus.suggest("แม่น้ำ").some(({ word }) => word === "ลำธาร"));
  assert.ok(!thesaurus.suggest("ชายฝั่ง").some(({ word }) => word === "ชายหาด"));
});

test("plant growth and decay actions remain distinct", () => {
  assert.ok(!thesaurus.suggest("บาน").some(({ word }) => word === "เหี่ยว"));
  assert.ok(!thesaurus.suggest("งอก").some(({ word }) => word === "เหี่ยว"));
});

test("knowledge and wisdom remain distinct concepts", () => {
  assert.ok(!thesaurus.suggest("ความรู้").some(({ word }) => word === "ปัญญา"));
  assert.ok(!thesaurus.suggest("ปัญญา").some(({ word }) => word === "ความรู้"));
});

test("examination and research remain distinct education actions", () => {
  assert.ok(!thesaurus.suggest("สอบ").some(({ word }) => word === "วิจัย"));
  assert.ok(!thesaurus.suggest("วิจัย").some(({ word }) => word === "สอบ"));
});

test("disease and fever remain distinct medical concepts", () => {
  assert.ok(!thesaurus.suggest("โรค").some(({ word }) => word === "ไข้"));
  assert.ok(!thesaurus.suggest("ไข้").some(({ word }) => word === "โรค"));
});

test("treatment and recovery remain distinct medical actions", () => {
  assert.ok(!thesaurus.suggest("รักษา").some(({ word }) => word === "หายป่วย"));
  assert.ok(!thesaurus.suggest("หายป่วย").some(({ word }) => word === "รักษา"));
  assert.ok(!thesaurus.suggest("หาย").some(({ word }) => word === "หายป่วย"));
});

test("birth and pregnancy vocabulary rises to royal register", () => {
  const birth = thesaurus.suggest("คลอด");
  assert.equal(birth.find(({ word }) => word === "ประสูติ")?.register, "ราชาศัพท์");
  assert.deepEqual(thesaurus.suggest("ตั้งครรภ์").map(({ registerRank }) => registerRank), [2, 5, 6, 8]);
});

test("artworks and artists remain distinct", () => {
  assert.ok(!thesaurus.suggest("ศิลปะ").some(({ word }) => word === "ศิลปิน"));
  assert.ok(!thesaurus.suggest("ศิลปิน").some(({ word }) => word === "ศิลปะ"));
});

test("songs, music, and singers remain distinct", () => {
  assert.ok(!thesaurus.suggest("เพลง").some(({ word }) => word === "ดนตรี"));
  assert.ok(!thesaurus.suggest("เพลง").some(({ word }) => word === "นักร้อง"));
  assert.ok(!thesaurus.suggest("นักร้อง").some(({ word }) => word === "เพลง"));
});

test("creation and repair remain distinct work actions", () => {
  assert.ok(!thesaurus.suggest("สร้าง").some(({ word }) => word === "ซ่อม"));
  assert.ok(!thesaurus.suggest("ซ่อม").some(({ word }) => word === "สร้าง"));
});

test("creative people remain separated by role", () => {
  assert.ok(!thesaurus.suggest("นักเขียน").some(({ word }) => word === "นักแสดง"));
  assert.ok(!thesaurus.suggest("นักแสดง").some(({ word }) => word === "นักร้อง"));
});

test("craft and performing suggestions preserve their POS", () => {
  for (const word of ["แกะสลัก", "เย็บ", "ทอ", "ปั้น", "ร้องเพลง", "แสดง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("farmer roles remain distinct", () => {
  assert.ok(!thesaurus.suggest("ชาวนา").some(({ word }) => word === "ชาวไร่"));
  assert.ok(!thesaurus.suggest("ชาวไร่").some(({ word }) => word === "ชาวสวน"));
});

test("cultivation and animal husbandry remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปลูก").some(({ word }) => word === "เลี้ยงสัตว์"));
  assert.ok(!thesaurus.suggest("เลี้ยงสัตว์").some(({ word }) => word === "ปลูก"));
});

test("sowing and harvesting remain distinct crop stages", () => {
  assert.ok(!thesaurus.suggest("หว่าน").some(({ word }) => word === "เก็บเกี่ยว"));
  assert.ok(!thesaurus.suggest("เก็บเกี่ยว").some(({ word }) => word === "หว่าน"));
});

test("rice fields and gardens retain separate place senses", () => {
  assert.ok(!thesaurus.suggest("นา").some(({ word }) => word === "สวน"));
  assert.ok(!thesaurus.suggest("สวน").some(({ word }) => word === "นา"));
});

test("agricultural actions preserve verb POS", () => {
  for (const word of ["ปลูก", "เพาะ", "หว่าน", "ไถ", "พรวน", "รดน้ำ", "เก็บเกี่ยว", "เกี่ยว"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("sweeping, wiping, washing, and laundering remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("กวาด").some(({ word }) => word === "เช็ด"));
  assert.ok(!thesaurus.suggest("ล้าง").some(({ word }) => word === "ซัก"));
  assert.ok(!thesaurus.suggest("ซัก").some(({ word }) => word === "ถู"));
});

test("arranging and discarding remain distinct household actions", () => {
  assert.ok(!thesaurus.suggest("จัด").some(({ word }) => word === "ทิ้ง"));
  assert.ok(!thesaurus.suggest("ทิ้ง").some(({ word }) => word === "จัด"));
});

test("dust and rubbish remain distinct nouns", () => {
  assert.ok(!thesaurus.suggest("ฝุ่น").some(({ word }) => word === "ขยะ"));
  assert.ok(!thesaurus.suggest("ขยะ").some(({ word }) => word === "ฝุ่น"));
});

test("household action suggestions preserve verb POS", () => {
  for (const word of ["กวาด", "ถู", "เช็ด", "ล้าง", "ซัก", "ตาก", "พับ", "จัด", "เรียง", "รื้อ", "ทิ้ง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("discarding and staining variants rise by register", () => {
  assert.deepEqual(thesaurus.suggest("ทิ้ง").map(({ registerRank }) => registerRank), [2, 6]);
  assert.deepEqual(thesaurus.suggest("เปื้อน").map(({ registerRank }) => registerRank), [3, 6]);
});

test("phones and smartphones retain distinct device scope", () => {
  assert.ok(!thesaurus.suggest("โทรศัพท์").some(({ word }) => word === "สมาร์ตโฟน"));
  assert.ok(!thesaurus.suggest("สมาร์ตโฟน").some(({ word }) => word === "โทรศัพท์"));
});

test("messages and data remain distinct information concepts", () => {
  assert.ok(!thesaurus.suggest("ข้อความ").some(({ word }) => word === "ข้อมูล"));
  assert.ok(!thesaurus.suggest("ข้อมูล").some(({ word }) => word === "ข้อความ"));
});

test("photographs and videos remain distinct media", () => {
  assert.ok(!thesaurus.suggest("ภาพถ่าย").some(({ word }) => word === "วิดีโอ"));
  assert.ok(!thesaurus.suggest("วิดีโอ").some(({ word }) => word === "ภาพถ่าย"));
});

test("uploading and downloading remain opposite transfer directions", () => {
  assert.ok(!thesaurus.suggest("ดาวน์โหลด").some(({ word }) => word === "อัปโหลด"));
  assert.ok(!thesaurus.suggest("อัปโหลด").some(({ word }) => word === "ดาวน์โหลด"));
});

test("modern communication actions preserve verb POS", () => {
  for (const word of ["โทร", "ส่งข้อความ", "แชต", "ติดต่อ", "ถ่ายรูป", "อัดเสียง", "ดาวน์โหลด", "อัปโหลด"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("civilian competition remains separate from warfare", () => {
  assert.ok(!thesaurus.suggest("การแข่งขัน").some(({ word }) => word === "สงคราม"));
  assert.ok(!thesaurus.suggest("สนามกีฬา").some(({ word }) => word === "สนามรบ"));
});

test("winners and losers remain opposite participant roles", () => {
  assert.ok(!thesaurus.suggest("ผู้ชนะ").some(({ word }) => word === "ผู้แพ้"));
  assert.ok(!thesaurus.suggest("ผู้แพ้").some(({ word }) => word === "ผู้ชนะ"));
});

test("players and athletes remain distinct role scopes", () => {
  assert.ok(!thesaurus.suggest("ผู้เล่น").some(({ word }) => word === "นักกีฬา"));
  assert.ok(!thesaurus.suggest("นักกีฬา").some(({ word }) => word === "ผู้เล่น"));
});

test("scores and rewards remain distinct competition nouns", () => {
  assert.ok(!thesaurus.suggest("คะแนน").some(({ word }) => word === "รางวัล"));
  assert.deepEqual(thesaurus.suggest("คะแนน").map(({ registerRank }) => registerRank), [2, 5]);
});

test("leisure entries preserve contextual POS", () => {
  assert.ok(thesaurus.suggest("เล่น").every(({ pos }) => pos.includes("ก.")));
  assert.ok(thesaurus.suggest("สนุก").every(({ pos }) => pos.includes("ว.")));
  assert.ok(thesaurus.suggest("พักผ่อน").every(({ pos }) => pos.includes("ก.")));
});

test("sleep, unconsciousness, and death remain distinct states", () => {
  assert.ok(!thesaurus.suggest("หลับ").some(({ word }) => word === "สลบ"));
  assert.ok(!thesaurus.suggest("สลบ").some(({ word }) => word === "ตาย"));
  assert.ok(!thesaurus.suggest("หลับ").some(({ word }) => word === "ตาย"));
});

test("ordinary dreams and nightmares remain distinct", () => {
  assert.ok(!thesaurus.suggest("ฝัน").some(({ word }) => word === "ฝันร้าย"));
  assert.ok(!thesaurus.suggest("ฝันร้าย").some(({ word }) => word === "ฝัน"));
});

test("waking and waking another remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("ตื่น").some(({ word }) => word === "ปลุก"));
  assert.ok(!thesaurus.suggest("ปลุก").some(({ word }) => word === "ตื่น"));
});

test("dreaming vocabulary rises to royal register", () => {
  const suggestion = thesaurus.suggest("ฝัน").find(({ word }) => word === "ทรงพระสุบิน");
  assert.equal(suggestion?.register, "ราชาศัพท์");
});

test("recovery senses remain separated", () => {
  assert.ok(!thesaurus.suggest("ฟื้น").some(({ word }) => word === "หายป่วย"));
  assert.ok(!thesaurus.suggest("พักฟื้น").some(({ word }) => word === "ฟื้น"));
});

test("insomnia variants rise from colloquial to literary", () => {
  assert.deepEqual(thesaurus.suggest("นอนไม่หลับ").map(({ registerRank }) => registerRank), [2, 6]);
});

test("infants, children, and teenagers remain distinct life stages", () => {
  assert.ok(!thesaurus.suggest("ทารก").some(({ word }) => word === "เด็ก"));
  assert.ok(!thesaurus.suggest("วัยเด็ก").some(({ word }) => word === "วัยรุ่น"));
  assert.ok(!thesaurus.suggest("วัยรุ่น").some(({ word }) => word === "ทารก"));
});

test("young men and young women remain distinct gendered terms", () => {
  assert.ok(!thesaurus.suggest("หนุ่ม").some(({ word }) => word === "สาว"));
  assert.ok(!thesaurus.suggest("สาว").some(({ word }) => word === "หนุ่ม"));
});

test("youth and old age remain opposite stages", () => {
  assert.ok(!thesaurus.suggest("อ่อนวัย").some(({ word }) => word === "ชรา"));
  assert.ok(!thesaurus.suggest("วัยชรา").some(({ word }) => word === "วัยเด็ก"));
});

test("birth and growth remain distinct life events", () => {
  assert.ok(!thesaurus.suggest("เกิด").some(({ word }) => word === "เติบโต"));
  assert.ok(!thesaurus.suggest("เติบโต").some(({ word }) => word === "เกิด"));
});

test("caregiving, teaching, and patronage remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("เลี้ยงดู").some(({ word }) => word === "อบรม"));
  assert.ok(!thesaurus.suggest("อบรม").some(({ word }) => word === "อุปถัมภ์"));
});

test("shared youth vocabulary keeps contextual POS", () => {
  assert.ok(thesaurus.suggest("วัยเด็ก").every(({ pos }) => pos.includes("น.")));
  assert.ok(thesaurus.suggest("อ่อนวัย").every(({ pos }) => pos.includes("ว.")));
});

test("weddings, funerals, and festivals remain distinct events", () => {
  assert.ok(!thesaurus.suggest("งานแต่งงาน").some(({ word }) => word === "งานศพ"));
  assert.ok(!thesaurus.suggest("งานศพ").some(({ word }) => word === "เทศกาล"));
  assert.ok(!thesaurus.suggest("เทศกาล").some(({ word }) => word === "งานแต่งงาน"));
});

test("hosts and guests remain distinct event roles", () => {
  assert.ok(!thesaurus.suggest("แขก").some(({ word }) => word === "เจ้าภาพ"));
  assert.ok(!thesaurus.suggest("เจ้าภาพ").some(({ word }) => word === "แขก"));
});

test("crowds and audiences remain distinct groups", () => {
  assert.ok(!thesaurus.suggest("ฝูงชน").some(({ word }) => word === "ผู้ชม"));
  assert.ok(!thesaurus.suggest("ผู้ชม").some(({ word }) => word === "ฝูงชน"));
});

test("socializing, gathering, and meeting remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("สังสรรค์").some(({ word }) => word === "ประชุม"));
  assert.ok(!thesaurus.suggest("ชุมนุม").some(({ word }) => word === "สังสรรค์"));
});

test("guest vocabulary rises through royal register", () => {
  assert.deepEqual(thesaurus.suggest("แขก").map(({ registerRank }) => registerRank), [5, 6, 8]);
  assert.equal(thesaurus.suggest("เชิญ").find(({ word }) => word === "กราบบังคมทูลเชิญ")?.register, "ราชาศัพท์");
});

test("royal ceremony vocabulary retains royal register", () => {
  assert.ok(thesaurus.suggest("ราชาภิเษก").every(({ register }) => register === "ราชาศัพท์"));
  assert.equal(thesaurus.suggest("งานแต่งงาน").find(({ word }) => word === "งานอภิเษกสมรส")?.register, "ราชาศัพท์");
});

test("silence and loudness remain opposite auditory qualities", () => {
  assert.ok(!thesaurus.suggest("ความเงียบ").some(({ word }) => word === "เสียงดัง"));
  assert.ok(!thesaurus.suggest("เงียบสงบ").some(({ word }) => word === "อึกทึก"));
});

test("echoes and general loud sounds remain distinct", () => {
  assert.ok(!thesaurus.suggest("เสียงสะท้อน").some(({ word }) => word === "เสียงรบกวน"));
  assert.ok(!thesaurus.suggest("ก้อง").some(({ word }) => word === "หนวกหู"));
});

test("hearing and intentional listening remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("ได้ยิน").some(({ word }) => word === "ตั้งใจฟัง"));
  assert.ok(!thesaurus.suggest("แอบฟัง").some(({ word }) => word === "ตั้งใจฟัง"));
});

test("screaming and groaning remain distinct vocal actions", () => {
  assert.ok(!thesaurus.suggest("กรีดร้อง").some(({ word }) => word === "คราง"));
  assert.ok(!thesaurus.suggest("คราง").some(({ word }) => word === "กรีดร้อง"));
});

test("hearing vocabulary rises to royal register", () => {
  const suggestion = thesaurus.suggest("ได้ยิน").find(({ word }) => word === "ทรงสดับ");
  assert.equal(suggestion?.register, "ราชาศัพท์");
});

test("auditory actions preserve verb POS", () => {
  for (const word of ["ได้ยิน", "แอบฟัง", "ตั้งใจฟัง", "กรีดร้อง", "คราง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("opposite dimensions remain separate", () => {
  for (const [first, second] of [["กว้าง", "แคบ"], ["หนา", "บาง"], ["ลึก", "ตื้น"], ["สูง", "เตี้ย"]]) {
    assert.ok(!thesaurus.suggest(first).some(({ word }) => word === second), `${first} -> ${second}`);
    assert.ok(!thesaurus.suggest(second).some(({ word }) => word === first), `${second} -> ${first}`);
  }
});

test("different dimensional axes remain separate", () => {
  assert.ok(!thesaurus.suggest("ยาว").some(({ word }) => word === "กว้าง"));
  assert.ok(!thesaurus.suggest("กว้าง").some(({ word }) => word === "ลึก"));
});

test("round, angular, flat, curved, and crooked shapes remain distinct", () => {
  assert.ok(!thesaurus.suggest("กลม").some(({ word }) => word === "เหลี่ยม"));
  assert.ok(!thesaurus.suggest("แบน").some(({ word }) => word === "กลม"));
  assert.ok(!thesaurus.suggest("ตรง").some(({ word }) => word === "คด"));
  assert.ok(!thesaurus.suggest("โค้ง").some(({ word }) => word === "ตรง"));
});

test("dimension and shape descriptions preserve adjective POS", () => {
  for (const word of ["เตี้ย", "ยาว", "กว้าง", "แคบ", "หนา", "บาง", "ลึก", "ตื้น", "กลม", "เหลี่ยม", "แบน", "โค้ง", "ตรง", "คด"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ว.")), word);
  }
});

test("shape nouns preserve noun POS across shared candidates", () => {
  assert.ok(thesaurus.suggest("รูปทรง").every(({ pos }) => pos.includes("น.")));
  assert.ok(thesaurus.suggest("รูปร่าง").every(({ pos }) => pos.includes("น.")));
});

test("different material types remain distinct", () => {
  assert.ok(!thesaurus.suggest("ทอง").some(({ word }) => word === "เงิน"));
  assert.ok(!thesaurus.suggest("หิน").some(({ word }) => word === "ไม้"));
  assert.ok(!thesaurus.suggest("ผ้า").some(({ word }) => word === "หนัง"));
  assert.ok(!thesaurus.suggest("ทราย").some(({ word }) => word === "โคลน"));
});

test("breaking, cracking, tearing, and denting remain distinct damage modes", () => {
  assert.ok(!thesaurus.suggest("แตก").some(({ word }) => word === "ร้าว"));
  assert.ok(!thesaurus.suggest("ฉีก").some(({ word }) => word === "หัก"));
  assert.ok(!thesaurus.suggest("บุบ").some(({ word }) => word === "พัง"));
});

test("melting and solidifying remain opposite state changes", () => {
  assert.ok(!thesaurus.suggest("ละลาย").some(({ word }) => word === "แข็งตัว"));
  assert.ok(!thesaurus.suggest("แข็งตัว").some(({ word }) => word === "ละลาย"));
});

test("burning and setting fire remain distinct voice perspectives", () => {
  assert.ok(!thesaurus.suggest("ไหม้").some(({ word }) => word === "เผา"));
  assert.ok(!thesaurus.suggest("เผา").some(({ word }) => word === "ไหม้"));
});

test("damage actions preserve contextual POS", () => {
  for (const word of ["แตก", "หัก", "ฉีก", "ยุบ", "ละลาย", "แข็งตัว", "เผา"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  assert.ok(thesaurus.suggest("ขาด").every(({ pos }) => pos.includes("ก.") || pos.includes("ว.")));
});

test("locking and unlocking remain opposite access actions", () => {
  assert.ok(!thesaurus.suggest("ล็อก").some(({ word }) => word === "ปลดล็อก"));
  assert.ok(!thesaurus.suggest("ปลดล็อก").some(({ word }) => word === "ล็อก"));
});

test("tying and untying remain opposite binding actions", () => {
  assert.ok(!thesaurus.suggest("ผูก").some(({ word }) => word === "แก้มัด"));
  assert.ok(!thesaurus.suggest("แก้มัด").some(({ word }) => word === "มัด"));
});

test("holding, carrying, and cradling modes remain distinct", () => {
  assert.ok(!thesaurus.suggest("หิ้ว").some(({ word }) => word === "แบก"));
  assert.ok(!thesaurus.suggest("แบก").some(({ word }) => word === "อุ้ม"));
  assert.ok(!thesaurus.suggest("อุ้ม").some(({ word }) => word === "ถือ"));
});

test("dragging and pushing remain opposite force directions", () => {
  assert.ok(!thesaurus.suggest("ลาก").some(({ word }) => word === "ผลัก"));
  assert.ok(!thesaurus.suggest("เข็น").some(({ word }) => word === "ดึง"));
});

test("pouring, decanting, and filling remain distinct liquid actions", () => {
  assert.ok(!thesaurus.suggest("เท").some(({ word }) => word === "เติม"));
  assert.ok(!thesaurus.suggest("ริน").some(({ word }) => word === "เท"));
});

test("cradling vocabulary rises to royal register", () => {
  assert.equal(thesaurus.suggest("อุ้ม").find(({ word }) => word === "ทรงอุ้ม")?.register, "ราชาศัพท์");
});

test("object manipulation entries preserve verb POS", () => {
  for (const word of ["แง้ม", "ล็อก", "ปลดล็อก", "ผูก", "มัด", "แก้มัด", "ยก", "หิ้ว", "แบก", "อุ้ม", "ปล่อย", "ลาก", "เข็น", "เท", "ริน", "เติม", "เอาออก"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("entering and exiting remain opposite movement directions", () => {
  assert.ok(!thesaurus.suggest("เข้าไป").some(({ word }) => word === "ออกไป"));
  assert.ok(!thesaurus.suggest("ออกไป").some(({ word }) => word === "เข้าไป"));
});

test("crossing, passing, and going underneath remain distinct paths", () => {
  assert.ok(!thesaurus.suggest("ข้าม").some(({ word }) => word === "ลอด"));
  assert.ok(!thesaurus.suggest("ลอด").some(({ word }) => word === "ผ่าน"));
});

test("arrival, departure, and return remain distinct journey stages", () => {
  assert.ok(!thesaurus.suggest("ถึง").some(({ word }) => word === "จากไป"));
  assert.ok(!thesaurus.suggest("จากไป").some(({ word }) => word === "กลับมา"));
  assert.ok(!thesaurus.suggest("กลับมา").some(({ word }) => word === "ถึง"));
});

test("falling and collapsing remain distinct movements", () => {
  assert.ok(!thesaurus.suggest("ตก").some(({ word }) => word === "ล้ม"));
  assert.ok(!thesaurus.suggest("ร่วง").some(({ word }) => word === "ล้ม"));
});

test("being lost and guiding remain opposite navigation states", () => {
  assert.ok(!thesaurus.suggest("หลงทาง").some(({ word }) => word === "นำทาง"));
  assert.ok(!thesaurus.suggest("นำทาง").some(({ word }) => word === "หลงทาง"));
});

test("directional movement entries preserve verb POS", () => {
  for (const word of ["เข้าไป", "ออกไป", "ข้าม", "ลอด", "ถึง", "จากไป", "กลับมา", "ปีน", "ไต่", "ตก", "ร่วง", "แวะ", "หลงทาง", "นำทาง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("cutting, pounding, and grinding remain distinct preparation actions", () => {
  assert.ok(!thesaurus.suggest("หั่น").some(({ word }) => word === "สับ"));
  assert.ok(!thesaurus.suggest("ตำ").some(({ word }) => word === "บด"));
  assert.ok(!thesaurus.suggest("โขลก").some(({ word }) => word === "หั่น"));
});

test("moist-heat cooking methods remain distinct", () => {
  assert.ok(!thesaurus.suggest("ต้ม").some(({ word }) => word === "นึ่ง"));
  assert.ok(!thesaurus.suggest("ลวก").some(({ word }) => word === "ตุ๋น"));
});

test("dry-heat cooking methods remain distinct", () => {
  assert.ok(!thesaurus.suggest("ทอด").some(({ word }) => word === "ย่าง"));
  assert.ok(!thesaurus.suggest("ปิ้ง").some(({ word }) => word === "อบ"));
  assert.ok(!thesaurus.suggest("ผัด").some(({ word }) => word === "คั่ว"));
});

test("tasting, seasoning, and serving remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("ชิม").some(({ word }) => word === "ปรุงรส"));
  assert.ok(!thesaurus.suggest("ปรุงรส").some(({ word }) => word === "เสิร์ฟ"));
});

test("street and person homonyms remain outside cooking senses", () => {
  assert.ok(thesaurus.suggest("ซอย").every(({ pos }) => pos.includes("น.")));
  assert.ok(thesaurus.suggest("คน").every(({ pos }) => pos.includes("น.")));
  assert.ok(!thesaurus.suggest("คน").some(({ word }) => word === "กวน"));
});

test("cooking entries preserve verb POS", () => {
  for (const word of ["ปรุงอาหาร", "หั่น", "สับ", "ตำ", "บด", "โขลก", "ต้ม", "นึ่ง", "ลวก", "ตุ๋น", "ทอด", "ย่าง", "ปิ้ง", "อบ", "ผัด", "คั่ว", "คลุก", "คนอาหาร", "ชิม", "ปรุงรส", "หมัก", "เสิร์ฟ", "จัดจาน", "ตัก", "ปอก"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("light, steady, and heavy rain remain distinct intensities", () => {
  assert.ok(!thesaurus.suggest("ฝนปรอย").some(({ word }) => word === "ฝนตกหนัก"));
  assert.ok(!thesaurus.suggest("ฝนพรำ").some(({ word }) => word === "ฝนกระหน่ำ"));
  assert.ok(!thesaurus.suggest("ฝนเท").some(({ word }) => word === "ฝนตกปรอย ๆ"));
});

test("rain weakening and stopping remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("ฝนซา").some(({ word }) => word === "ฝนหยุดตก"));
  assert.ok(!thesaurus.suggest("ฝนหยุด").some(({ word }) => word === "ฝนเบาลง"));
});

test("wind strengths and storm arrival remain distinct phenomena", () => {
  assert.ok(!thesaurus.suggest("ลมโชย").some(({ word }) => word === "ลมกรรโชก"));
  assert.ok(!thesaurus.suggest("ลมแรง").some(({ word }) => word === "พายุมา"));
});

test("fog appearing and clearing remain opposite stages", () => {
  assert.ok(!thesaurus.suggest("หมอกลง").some(({ word }) => word === "หมอกสลาย"));
  assert.ok(!thesaurus.suggest("หมอกจาง").some(({ word }) => word === "หมอกปกคลุม"));
});

test("dawn, dusk, sunrise, and sunset remain distinct light stages", () => {
  assert.ok(!thesaurus.suggest("ฟ้าสาง").some(({ word }) => word === "สนธยา"));
  assert.ok(!thesaurus.suggest("พระอาทิตย์ขึ้น").some(({ word }) => word === "ตะวันตกดิน"));
  assert.ok(!thesaurus.suggest("พระอาทิตย์ตก").some(({ word }) => word === "ตะวันขึ้น"));
});

test("weather events preserve contextual POS", () => {
  for (const word of ["ฝนปรอย", "ฝนพรำ", "ฝนเท", "ฝนซา", "ฝนหยุด", "ลมพัด", "ลมโชย", "พายุเข้า", "เมฆเคลื่อน", "หมอกลง", "หมอกจาง", "แดดออก", "พระอาทิตย์ขึ้น", "พระอาทิตย์ตก", "หิมะตก", "ลูกเห็บตก"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  for (const word of ["ลมแรง", "เมฆครึ้ม", "แดดแรง", "อบอ้าว", "หนาวจัด", "เย็นสบาย", "อากาศแจ่มใส"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ว.")), word);
  }
  for (const word of ["น้ำค้าง", "น้ำค้างแข็ง", "รุ้ง", "พลบค่ำ", "ภัยแล้ง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("น.")), word);
  }
});

test("steady light, blinking light, and flashing light remain distinct", () => {
  assert.ok(!thesaurus.suggest("ส่องแสง").some(({ word }) => word === "แสงติด ๆ ดับ ๆ"));
  assert.ok(!thesaurus.suggest("แสงกะพริบ").some(({ word }) => word === "แสงแลบ"));
  assert.ok(!thesaurus.suggest("แสงวาบ").some(({ word }) => word === "ฉายแสง"));
});

test("brightness, dimness, and darkness remain distinct", () => {
  assert.ok(!thesaurus.suggest("สว่างจ้า").some(({ word }) => word === "มัวสลัว"));
  assert.ok(!thesaurus.suggest("สลัว").some(({ word }) => word === "มืดมิด"));
  assert.ok(!thesaurus.suggest("มืดสนิท").some(({ word }) => word === "เจิดจ้า"));
});

test("blurred, faint, visible, and invisible remain distinct visual states", () => {
  assert.ok(!thesaurus.suggest("พร่ามัว").some(({ word }) => word === "เห็นแจ่มชัด"));
  assert.ok(!thesaurus.suggest("เลือนราง").some(({ word }) => word === "ไม่อาจมองเห็น"));
  assert.ok(!thesaurus.suggest("มองเห็นชัด").some(({ word }) => word === "แลไม่เห็น"));
});

test("transparent, translucent, and opaque remain separate material properties", () => {
  assert.ok(!thesaurus.suggest("โปร่งใส").some(({ word }) => word === "กึ่งโปร่งใส"));
  assert.ok(!thesaurus.suggest("โปร่งแสง").some(({ word }) => word === "แสงผ่านไม่ได้"));
  assert.ok(!thesaurus.suggest("ทึบแสง").some(({ word }) => word === "มองทะลุได้"));
});

test("bright, pale, muted, dark, and light colors remain distinct", () => {
  assert.ok(!thesaurus.suggest("สีสด").some(({ word }) => word === "สีไม่สด"));
  assert.ok(!thesaurus.suggest("สีซีด").some(({ word }) => word === "สีจัดจ้าน"));
  assert.ok(!thesaurus.suggest("สีเข้ม").some(({ word }) => word === "สีละมุน"));
  assert.ok(!thesaurus.suggest("สีอ่อน").some(({ word }) => word === "สีแก่"));
});

test("glossy and matte surfaces remain opposite finishes", () => {
  assert.ok(!thesaurus.suggest("มันวาว").some(({ word }) => word === "ผิวไม่มันวาว"));
  assert.ok(!thesaurus.suggest("ผิวด้าน").some(({ word }) => word === "วาวมัน"));
});

test("light and visual entries preserve contextual POS", () => {
  for (const word of ["ส่องแสง", "เรืองแสง", "เปล่งประกาย", "แสงกะพริบ", "มองเห็นชัด", "มองไม่เห็น", "สะท้อนแสง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  for (const word of ["ระยิบระยับ", "วาววับ", "สว่างจ้า", "สลัว", "มืดสนิท", "พร่ามัว", "เลือนราง", "โปร่งใส", "โปร่งแสง", "ทึบแสง", "สีสด", "สีซีด", "สีหม่น", "สีเข้ม", "สีอ่อน", "แดงก่ำ", "ขาวซีด", "ดำสนิท", "มันวาว", "ผิวด้าน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ว.")), word);
  }
  for (const word of ["แสงสว่าง", "เงามืด", "เงาสะท้อน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("น.")), word);
  }
});

test("faint, strong, stale, rotten, pungent, and burnt smells remain distinct", () => {
  assert.ok(!thesaurus.suggest("หอมอ่อน ๆ").some(({ word }) => word === "กลิ่นหอมเข้ม"));
  assert.ok(!thesaurus.suggest("เหม็นอับ").some(({ word }) => word === "ส่งกลิ่นเน่า"));
  assert.ok(!thesaurus.suggest("กลิ่นฉุน").some(({ word }) => word === "กลิ่นไหม้เกรียม"));
  assert.ok(!thesaurus.suggest("กลิ่นคาว").some(({ word }) => word === "กลิ่นไอดิน"));
});

test("balanced, strong, mild, rich, and cloying tastes remain distinct", () => {
  assert.ok(!thesaurus.suggest("รสกลมกล่อม").some(({ word }) => word === "รสเข้มข้น"));
  assert.ok(!thesaurus.suggest("รสอ่อน").some(({ word }) => word === "มันจนเลี่ยน"));
  assert.ok(!thesaurus.suggest("รสมัน").some(({ word }) => word === "เลี่ยนมัน"));
});

test("mixed tastes remain separate combinations", () => {
  assert.ok(!thesaurus.suggest("หวานอมเปรี้ยว").some(({ word }) => word === "ขมเจือหวาน"));
  assert.ok(!thesaurus.suggest("เค็มปะแล่ม").some(({ word }) => word === "เผ็ดจนชา"));
});

test("smooth, rough, coarse, and slippery surfaces remain distinct", () => {
  assert.ok(!thesaurus.suggest("ผิวเรียบ").some(({ word }) => word === "ตะปุ่มตะป่ำ"));
  assert.ok(!thesaurus.suggest("ผิวสาก").some(({ word }) => word === "ผิวเรียบลื่น"));
  assert.ok(!thesaurus.suggest("ผิวลื่น").some(({ word }) => word === "หยาบกร้าน"));
});

test("sticky textures remain separate from crisp and crumbly textures", () => {
  assert.ok(!thesaurus.suggest("เหนียวหนึบ").some(({ word }) => word === "กรอบกรุบ"));
  assert.ok(!thesaurus.suggest("เหนียวเหนอะ").some(({ word }) => word === "ร่วนแตกง่าย"));
  assert.ok(!thesaurus.suggest("กรุบกรอบ").some(({ word }) => word === "เหนียวติดมือ"));
});

test("slightly damp, juicy, and caked dry remain distinct moisture states", () => {
  assert.ok(!thesaurus.suggest("ชื้นหมาด").some(({ word }) => word === "ฉ่ำน้ำ"));
  assert.ok(!thesaurus.suggest("ชุ่มฉ่ำ").some(({ word }) => word === "แห้งติดแน่น"));
  assert.ok(!thesaurus.suggest("แห้งกรัง").some(({ word }) => word === "ชื้นเล็กน้อย"));
});

test("smell nouns and sensory adjectives preserve contextual POS", () => {
  for (const word of ["กลิ่นฉุน", "กลิ่นคาว", "กลิ่นไหม้", "กลิ่นดิน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("น.")), word);
  }
  for (const word of ["หอมอ่อน ๆ", "หอมแรง", "เหม็นอับ", "เหม็นเน่า", "รสกลมกล่อม", "รสจัด", "รสอ่อน", "มันเลี่ยน", "รสมัน", "รสฝาด", "เผ็ดชา", "หวานอมเปรี้ยว", "เค็มปะแล่ม", "ขมอมหวาน", "อร่อย", "เนียน", "ผิวเรียบ", "ผิวขรุขระ", "ผิวสาก", "ผิวลื่น", "เหนียวหนึบ", "เหนียวเหนอะ", "กรุบกรอบ", "เนื้อร่วน", "นุ่มฟู", "เนื้อแน่น", "ยืดหยุ่น", "เปราะ", "ชื้นหมาด", "ชุ่มฉ่ำ", "แห้งกรัง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ว.")), word);
  }
});

test("avoiding, meeting, and staring into eyes remain distinct gaze actions", () => {
  assert.ok(!thesaurus.suggest("หลบตา").some(({ word }) => word === "ประสานสายตา"));
  assert.ok(!thesaurus.suggest("สบตา").some(({ word }) => word === "เพ่งมองดวงตา"));
  assert.ok(!thesaurus.suggest("จ้องตา").some(({ word }) => word === "เลี่ยงสบตา"));
});

test("pressing lips, biting lips, and clenching teeth remain distinct", () => {
  assert.ok(!thesaurus.suggest("เม้มปาก").some(({ word }) => word === "ขบริมฝีปาก"));
  assert.ok(!thesaurus.suggest("กัดริมฝีปาก").some(({ word }) => word === "ขบกราม"));
  assert.ok(!thesaurus.suggest("กัดฟัน").some(({ word }) => word === "เม้มริมฝีปาก"));
});

test("clenching and releasing a hand remain opposite gestures", () => {
  assert.ok(!thesaurus.suggest("กำมือ").some(({ word }) => word === "แบมือออก"));
  assert.ok(!thesaurus.suggest("คลายหมัด").some(({ word }) => word === "กำมือแน่น"));
});

test("holding breath, heavy breathing, and panting remain distinct respiratory actions", () => {
  assert.ok(!thesaurus.suggest("กลั้นหายใจ").some(({ word }) => word === "หายใจหอบ"));
  assert.ok(!thesaurus.suggest("หายใจแรง").some(({ word }) => word === "อั้นหายใจ"));
  assert.ok(!thesaurus.suggest("หอบเหนื่อย").some(({ word }) => word === "หยุดหายใจชั่วครู่"));
});

test("startling, stopping, stiffening, and trembling remain distinct reactions", () => {
  assert.ok(!thesaurus.suggest("สะดุ้ง").some(({ word }) => word === "หยุดฉับพลัน"));
  assert.ok(!thesaurus.suggest("ชะงัก").some(({ word }) => word === "สั่นระริก"));
  assert.ok(!thesaurus.suggest("ตัวแข็ง").some(({ word }) => word === "ผวาสุดตัว"));
  assert.ok(!thesaurus.suggest("ตัวสั่น").some(({ word }) => word === "แข็งทื่อ"));
});

test("nodding acceptance and shaking rejection remain opposite responses", () => {
  assert.ok(!thesaurus.suggest("พยักหน้ารับ").some(({ word }) => word === "ส่ายหน้าไม่รับ"));
  assert.ok(!thesaurus.suggest("ส่ายหน้าปฏิเสธ").some(({ word }) => word === "ผงกหน้ารับ"));
});

test("blinking, winking, widening, and narrowing eyes remain distinct", () => {
  assert.ok(!thesaurus.suggest("กะพริบตา").some(({ word }) => word === "หลิ่วตา"));
  assert.ok(!thesaurus.suggest("ขยิบตา").some(({ word }) => word === "ตาเบิกกว้าง"));
  assert.ok(!thesaurus.suggest("เบิกตา").some(({ word }) => word === "ทำตาหยี"));
  assert.ok(!thesaurus.suggest("หรี่ตา").some(({ word }) => word === "เบิกพระเนตร"));
});

test("eyebrow and eye gestures rise to royal register", () => {
  assert.equal(thesaurus.suggest("เลิกคิ้ว").find(({ word }) => word === "เลิกพระขนง")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("เบิกตา").find(({ word }) => word === "เบิกพระเนตร")?.register, "ราชาศัพท์");
});

test("body-language entries preserve verb POS", () => {
  for (const word of ["เลิกคิ้ว", "หลบตา", "สบตา", "จ้องตา", "เม้มปาก", "กัดริมฝีปาก", "กัดฟัน", "กอดอก", "กำมือ", "คลายหมัด", "กลั้นหายใจ", "หายใจแรง", "หอบเหนื่อย", "สะดุ้ง", "สะดุ้งโหยง", "ชะงัก", "ตัวสั่น", "สั่นสะท้าน", "เหงื่อซึม", "เหงื่อไหล", "กลืนน้ำลาย", "พยักหน้ารับ", "ส่ายหน้าปฏิเสธ", "ก้มหน้า", "เชิดหน้า", "กะพริบตา", "ขยิบตา", "เบิกตา", "หรี่ตา", "ทำหน้าบึ้ง", "แสยะยิ้ม", "ยิ้มเจื่อน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("general speech no longer includes shouting, chatting, or negotiation", () => {
  const words = thesaurus.suggest("พูด").map(({ word }) => word);
  for (const unrelated of ["โวย", "คุย", "สนทนา", "เจรจา"]) assert.ok(!words.includes(unrelated), unrelated);
  assert.ok(words.includes("กล่าว"));
});

test("shouting and whispering remain opposite voice levels", () => {
  assert.ok(!thesaurus.suggest("ตะโกน").some(({ word }) => word === "กระซิบแผ่ว"));
  assert.ok(!thesaurus.suggest("กระซิบ").some(({ word }) => word === "ตะเบ็งเสียง"));
});

test("hesitating, rapid, slow, hard, and faint speech remain distinct delivery modes", () => {
  assert.ok(!thesaurus.suggest("พูดอึกอัก").some(({ word }) => word === "กล่าวถ้อยคำรวดเร็ว"));
  assert.ok(!thesaurus.suggest("พูดรัว").some(({ word }) => word === "กล่าวช้า ๆ"));
  assert.ok(!thesaurus.suggest("พูดเสียงแข็ง").some(({ word }) => word === "เอ่ยแผ่วเบา"));
  assert.ok(!thesaurus.suggest("พูดแผ่ว").some(({ word }) => word === "เอ่ยเสียงกระด้าง"));
});

test("cutting off and interrupting remain distinct conversation actions", () => {
  assert.ok(!thesaurus.suggest("พูดตัดบท").some(({ word }) => word === "แทรกคำ"));
  assert.ok(!thesaurus.suggest("พูดแทรก").some(({ word }) => word === "ยุติการสนทนากะทันหัน"));
});

test("sarcasm, insinuation, lying, and truth-telling remain distinct intents", () => {
  assert.ok(!thesaurus.suggest("พูดประชด").some(({ word }) => word === "เหน็บแนม"));
  assert.ok(!thesaurus.suggest("พูดโกหก").some(({ word }) => word === "กล่าวตามจริง"));
  assert.ok(!thesaurus.suggest("พูดจริง").some(({ word }) => word === "กล่าวเท็จ"));
});

test("repeating, probing, and returning questions remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถามย้ำ").some(({ word }) => word === "สอบซัก"));
  assert.ok(!thesaurus.suggest("ซักถาม").some(({ word }) => word === "ตั้งคำถามกลับ"));
  assert.ok(!thesaurus.suggest("ถามกลับ").some(({ word }) => word === "ถามซ้ำ"));
});

test("evasive, immediate, short, and absent answers remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตอบเลี่ยง").some(({ word }) => word === "ขานรับทันควัน"));
  assert.ok(!thesaurus.suggest("ตอบทันที").some(({ word }) => word === "ไม่ตอบ"));
  assert.ok(!thesaurus.suggest("ตอบสั้น").some(({ word }) => word === "บ่ายเบี่ยงคำตอบ"));
});

test("request vocabulary rises to royal register", () => {
  assert.equal(thesaurus.suggest("ขอร้อง").find(({ word }) => word === "ทูลขอ")?.register, "ราชาศัพท์");
});

test("dialogue delivery entries preserve verb POS", () => {
  for (const word of ["พูดอึกอัก", "พูดติดขัด", "พูดรัว", "พูดช้า", "พูดเสียงสั่น", "พูดเสียงแข็ง", "พูดห้วน", "พูดแผ่ว", "พูดตัดบท", "พูดแทรก", "พูดประชด", "พูดเสียดสี", "พูดโกหก", "พูดจริง", "สารภาพ", "ถามย้ำ", "ซักถาม", "ไต่ถาม", "ถามกลับ", "ตอบเลี่ยง", "ตอบทันที", "ตอบสั้น", "ขอร้อง", "อ้อนวอน", "สั่งห้าม", "เตือนซ้ำ", "รับปาก", "ปฏิเสธตรง ๆ", "พูดปลอบ", "เรียกชื่อ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("base postures no longer include sleep, collapse, bowing, or looking back", () => {
  assert.ok(!thesaurus.suggest("นอน").some(({ word }) => word === "หลับ"));
  assert.ok(!thesaurus.suggest("นั่ง").some(({ word }) => word === "ทรุดตัว"));
  assert.ok(!thesaurus.suggest("ก้ม").some(({ word }) => word === "โค้งคำนับ"));
  assert.ok(!thesaurus.suggest("หัน").some(({ word }) => word === "เหลียว"));
});

test("standing up, sitting down, and remaining standing stay distinct", () => {
  assert.ok(!thesaurus.suggest("ลุกขึ้น").some(({ word }) => word === "ทิ้งตัวนั่ง"));
  assert.ok(!thesaurus.suggest("นั่งลง").some(({ word }) => word === "คงท่ายืน"));
  assert.ok(!thesaurus.suggest("ยืนอยู่").some(({ word }) => word === "หย่อนตัวนั่ง"));
});

test("leaning, reclining, and wall support remain distinct postures", () => {
  assert.ok(!thesaurus.suggest("เอนตัว").some(({ word }) => word === "พิงหลัง"));
  assert.ok(!thesaurus.suggest("เอนหลัง").some(({ word }) => word === "อิงผนัง"));
  assert.ok(!thesaurus.suggest("พิงกำแพง").some(({ word }) => word === "เอียงตัว"));
});

test("supine, prone, and side-lying positions remain distinct", () => {
  assert.ok(!thesaurus.suggest("นอนหงาย").some(({ word }) => word === "นอนหันหน้าลง"));
  assert.ok(!thesaurus.suggest("นอนคว่ำ").some(({ word }) => word === "นอนตะแคงข้าง"));
  assert.ok(!thesaurus.suggest("นอนตะแคง").some(({ word }) => word === "นอนแผ่หงาย"));
});

test("kneeling, crouching, cross-legged, and side-folded sitting remain distinct", () => {
  assert.ok(!thesaurus.suggest("นั่งคุกเข่า").some(({ word }) => word === "นั่งยอง ๆ"));
  assert.ok(!thesaurus.suggest("นั่งขัดสมาธิ").some(({ word }) => word === "พับเพียบนั่ง"));
  assert.ok(!thesaurus.suggest("นั่งพับเพียบ").some(({ word }) => word === "นั่งขัดขา"));
});

test("crouching, collapsing, knee-buckling, and falling prone remain distinct", () => {
  assert.ok(!thesaurus.suggest("ย่อตัว").some(({ word }) => word === "อ่อนยวบลง"));
  assert.ok(!thesaurus.suggest("ทรุดตัว").some(({ word }) => word === "เข่าอ่อน"));
  assert.ok(!thesaurus.suggest("ทรุดเข่า").some(({ word }) => word === "ล้มฟุบ"));
  assert.ok(!thesaurus.suggest("ฟุบลง").some(({ word }) => word === "ลดตัวลง"));
});

test("facing, turning away, and looking back remain distinct rotations", () => {
  assert.ok(!thesaurus.suggest("หันหน้า").some(({ word }) => word === "เบือนหลัง"));
  assert.ok(!thesaurus.suggest("หันหลัง").some(({ word }) => word === "หันกลับมอง"));
  assert.ok(!thesaurus.suggest("เหลียวกลับ").some(({ word }) => word === "หันใบหน้า"));
});

test("face lifting and kneeling vocabulary rise to royal register", () => {
  assert.equal(thesaurus.suggest("เงยหน้า").find(({ word }) => word === "เงยพระพักตร์")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("คุกเข่าลง").find(({ word }) => word === "คุกพระชานุลง")?.register, "ราชาศัพท์");
});

test("posture and pose-change entries preserve verb POS", () => {
  for (const word of ["ลุกขึ้น", "นั่งลง", "ยืนอยู่", "ยืนตรง", "ยืนตระหง่าน", "เอนตัว", "เอนหลัง", "พิง", "พิงกำแพง", "นอนลง", "นอนหงาย", "นอนคว่ำ", "นอนตะแคง", "พลิกตัว", "คุกเข่าลง", "นั่งคุกเข่า", "หมอบลง", "นอนหมอบ", "ย่อตัว", "นั่งยอง", "นั่งขัดสมาธิ", "นั่งพับเพียบ", "ก้มตัว", "เงยหน้า", "เงยตัว", "ทรุดตัว", "ทรุดเข่า", "ฟุบลง", "หันหน้า", "หันหลัง", "เหลียวกลับ", "ยืดตัว", "ขดตัว", "งอตัว"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("generic grabbing and pulling exclude sudden or dragging actions", () => {
  assert.ok(!thesaurus.suggest("จับ").some(({ word }) => word === "คว้า"));
  assert.ok(!thesaurus.suggest("ดึง").some(({ word }) => word === "ลาก"));
  assert.ok(!thesaurus.suggest("ดึง").some(({ word }) => word === "กระชาก"));
});

test("touching, holding hands, grabbing arms, and linking arms remain distinct", () => {
  assert.ok(!thesaurus.suggest("แตะ").some(({ word }) => word === "กุมมือ"));
  assert.ok(!thesaurus.suggest("จับมือ").some(({ word }) => word === "จับแขนฉับพลัน"));
  assert.ok(!thesaurus.suggest("คว้าแขน").some(({ word }) => word === "สอดแขนคล้อง"));
  assert.ok(!thesaurus.suggest("คล้องแขน").some(({ word }) => word === "ยึดแขนไม่ให้ไป"));
});

test("squeezing and releasing hands remain opposite actions", () => {
  assert.ok(!thesaurus.suggest("บีบมือ").some(({ word }) => word === "ปล่อยจากมือ"));
  assert.ok(!thesaurus.suggest("ปล่อยมือ").some(({ word }) => word === "กุมมือแน่น"));
});

test("stroking head, hair, cheek, and back remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("ลูบหัว").some(({ word }) => word === "ไล้เรือนผม"));
  assert.ok(!thesaurus.suggest("ลูบผม").some(({ word }) => word === "สัมผัสพวงแก้ม"));
  assert.ok(!thesaurus.suggest("ลูบหลัง").some(({ word }) => word === "ลูบศีรษะ"));
});

test("shoulder touch, pat, embrace, and waist hold remain distinct", () => {
  assert.ok(!thesaurus.suggest("แตะไหล่").some(({ word }) => word === "ตบลงบนบ่า"));
  assert.ok(!thesaurus.suggest("ตบไหล่").some(({ word }) => word === "พาดแขนรอบไหล่"));
  assert.ok(!thesaurus.suggest("โอบไหล่").some(({ word }) => word === "โอบรอบเอว"));
});

test("tight, light, rear embraces, and breaking an embrace remain distinct", () => {
  assert.ok(!thesaurus.suggest("กอดแน่น").some(({ word }) => word === "กอดหลวม ๆ"));
  assert.ok(!thesaurus.suggest("กอดจากด้านหลัง").some(({ word }) => word === "ถอนตัวจากอ้อมแขน"));
  assert.ok(!thesaurus.suggest("ผละจากอ้อมกอด").some(({ word }) => word === "สวมกอดแนบแน่น"));
});

test("forehead kiss and cheek kiss remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("จูบหน้าผาก").some(({ word }) => word === "จุ๊บแก้ม"));
  assert.ok(!thesaurus.suggest("หอมแก้ม").some(({ word }) => word === "จุมพิตหน้าผาก"));
});

test("supporting, helping walk, pulling up, restraining, and pushing remain distinct", () => {
  assert.ok(!thesaurus.suggest("ประคองตัว").some(({ word }) => word === "ดึงให้ลุก"));
  assert.ok(!thesaurus.suggest("พยุงเดิน").some(({ word }) => word === "ยึดแขนไม่ให้ไป"));
  assert.ok(!thesaurus.suggest("รั้งแขน").some(({ word }) => word === "ดันออก"));
  assert.ok(!thesaurus.suggest("ผลักออก").some(({ word }) => word === "ช่วยพยุง"));
});

test("light and forceful pushing remain separate force levels", () => {
  assert.ok(!thesaurus.suggest("ผลักเบา ๆ").some(({ word }) => word === "ผลักเต็มแรง"));
  assert.ok(!thesaurus.suggest("ผลักแรง").some(({ word }) => word === "ดันเบา ๆ"));
});

test("head stroking vocabulary rises to royal register", () => {
  assert.equal(thesaurus.suggest("ลูบหัว").find(({ word }) => word === "ลูบพระเศียร")?.register, "ราชาศัพท์");
});

test("interpersonal touch entries preserve verb POS", () => {
  for (const word of ["แตะ", "สัมผัส", "จับมือ", "จับแขน", "คว้าแขน", "เกาะแขน", "คล้องแขน", "บีบมือ", "ปล่อยมือ", "ลูบ", "ลูบหัว", "ลูบผม", "ลูบแก้ม", "ลูบหลัง", "แตะไหล่", "ตบไหล่", "โอบไหล่", "โอบเอว", "กอดแน่น", "กอดเบา ๆ", "กอดจากด้านหลัง", "ผละจากอ้อมกอด", "จูบเบา ๆ", "จูบหน้าผาก", "หอมแก้ม", "ประคอง", "ประคองตัว", "พยุงเดิน", "ฉุดขึ้น", "รั้งแขน", "ดึงกลับ", "ผลักออก", "ผลักเบา ๆ", "ผลักแรง", "ปัดมือ", "กันไว้"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("dressing and changing clothes remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("แต่งตัว").some(({ word }) => word === "เปลี่ยนชุด"));
  assert.ok(!thesaurus.suggest("เปลี่ยนเสื้อผ้า").some(({ word }) => word === "ทรงเครื่อง"));
});

test("putting on and removing upper and lower garments remain opposite", () => {
  assert.ok(!thesaurus.suggest("สวมเสื้อ").some(({ word }) => word === "เอาเสื้อออก"));
  assert.ok(!thesaurus.suggest("ถอดเสื้อ").some(({ word }) => word === "ใส่เสื้อ"));
  assert.ok(!thesaurus.suggest("สวมกางเกง").some(({ word }) => word === "ปลดกางเกงออก"));
  assert.ok(!thesaurus.suggest("ถอดกางเกง").some(({ word }) => word === "ใส่กางเกง"));
});

test("headwear, footwear, and socks remain distinct clothing targets", () => {
  assert.ok(!thesaurus.suggest("สวมหมวก").some(({ word }) => word === "ใส่รองเท้า"));
  assert.ok(!thesaurus.suggest("สวมรองเท้า").some(({ word }) => word === "ใส่ถุงเท้า"));
  assert.ok(!thesaurus.suggest("ถอดถุงเท้า").some(({ word }) => word === "เอาหมวกออก"));
});

test("buttoning, unbuttoning, zipping up, and unzipping remain opposite fastener actions", () => {
  assert.ok(!thesaurus.suggest("ติดกระดุม").some(({ word }) => word === "แกะกระดุม"));
  assert.ok(!thesaurus.suggest("ปลดกระดุม").some(({ word }) => word === "กลัดกระดุม"));
  assert.ok(!thesaurus.suggest("รูดซิปขึ้น").some(({ word }) => word === "เปิดซิป"));
  assert.ok(!thesaurus.suggest("รูดซิปลง").some(({ word }) => word === "ปิดซิป"));
});

test("tying and untying shoes remain opposite", () => {
  assert.ok(!thesaurus.suggest("ผูกเชือกรองเท้า").some(({ word }) => word === "แก้ปมเชือก"));
  assert.ok(!thesaurus.suggest("แก้เชือกรองเท้า").some(({ word }) => word === "รัดเชือกรองเท้า"));
});

test("belt fastening and release remain opposite", () => {
  assert.ok(!thesaurus.suggest("คาดเข็มขัด").some(({ word }) => word === "แกะเข็มขัด"));
  assert.ok(!thesaurus.suggest("ปลดเข็มขัด").some(({ word }) => word === "รัดเข็มขัด"));
});

test("rolling sleeves, lowering sleeves, tucking, and untucking remain distinct", () => {
  assert.ok(!thesaurus.suggest("พับแขนเสื้อ").some(({ word }) => word === "ปล่อยแขนเสื้อลง"));
  assert.ok(!thesaurus.suggest("ดึงแขนเสื้อลง").some(({ word }) => word === "ถกแขนเสื้อ"));
  assert.ok(!thesaurus.suggest("เหน็บชายเสื้อ").some(({ word }) => word === "ดึงชายเสื้อออก"));
  assert.ok(!thesaurus.suggest("ปล่อยชายเสื้อ").some(({ word }) => word === "เก็บชายเสื้อ"));
});

test("rings, necklaces, and brooches remain distinct accessories", () => {
  assert.ok(!thesaurus.suggest("สวมแหวน").some(({ word }) => word === "คล้องสร้อย"));
  assert.ok(!thesaurus.suggest("ถอดสร้อย").some(({ word }) => word === "กลัดเข็ม"));
  assert.ok(!thesaurus.suggest("ติดเข็มกลัด").some(({ word }) => word === "ดึงแหวนออก"));
});

test("tying up and letting down hair remain opposite grooming actions", () => {
  assert.ok(!thesaurus.suggest("รวบผม").some(({ word }) => word === "ปล่อยผมสยาย"));
  assert.ok(!thesaurus.suggest("ปล่อยผม").some(({ word }) => word === "มัดผม"));
});

test("dress, hat, and footwear vocabulary rise to royal register", () => {
  assert.equal(thesaurus.suggest("แต่งกาย").find(({ word }) => word === "ทรงเครื่อง")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("สวมหมวก").find(({ word }) => word === "ทรงพระมาลา")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("สวมรองเท้า").find(({ word }) => word === "ทรงฉลองพระบาท")?.register, "ราชาศัพท์");
});

test("dressing and fastening entries preserve verb POS", () => {
  for (const word of ["แต่งตัว", "แต่งกาย", "สวมเสื้อ", "ถอดเสื้อ", "สวมกางเกง", "ถอดกางเกง", "สวมชุด", "เปลี่ยนเสื้อผ้า", "สวมหมวก", "ถอดหมวก", "สวมรองเท้า", "ถอดรองเท้า", "สวมถุงเท้า", "ถอดถุงเท้า", "ติดกระดุม", "ปลดกระดุม", "รูดซิปขึ้น", "รูดซิปลง", "ผูกเชือกรองเท้า", "แก้เชือกรองเท้า", "คาดเข็มขัด", "ปลดเข็มขัด", "พับแขนเสื้อ", "ดึงแขนเสื้อลง", "จัดคอเสื้อ", "เหน็บชายเสื้อ", "ปล่อยชายเสื้อ", "คลุมเสื้อ", "ห่มผ้า", "ถอดเสื้อคลุม", "สวมแหวน", "ถอดแหวน", "สวมสร้อย", "ถอดสร้อย", "ติดเข็มกลัด", "รวบผม", "ปล่อยผม"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("bathing, face washing, hand washing, and tooth brushing remain distinct", () => {
  assert.ok(!thesaurus.suggest("อาบน้ำ").some(({ word }) => word === "ชำระใบหน้า"));
  assert.ok(!thesaurus.suggest("ล้างหน้า").some(({ word }) => word === "ทำความสะอาดมือ"));
  assert.ok(!thesaurus.suggest("แปรงฟัน").some(({ word }) => word === "กลั้วปาก"));
});

test("wiping face, body, and hands remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("เช็ดหน้า").some(({ word }) => word === "เช็ดร่างกาย"));
  assert.ok(!thesaurus.suggest("เช็ดตัว").some(({ word }) => word === "ซับมือ"));
  assert.ok(!thesaurus.suggest("เช็ดมือ").some(({ word }) => word === "ซับพระพักตร์"));
});

test("washing, drying, combing, brushing, and detangling hair remain distinct", () => {
  assert.ok(!thesaurus.suggest("สระผม").some(({ word }) => word === "เป่าผมให้แห้ง"));
  assert.ok(!thesaurus.suggest("เช็ดผม").some(({ word }) => word === "สางผม"));
  assert.ok(!thesaurus.suggest("หวีผม").some(({ word }) => word === "แปรงเส้นผม"));
  assert.ok(!thesaurus.suggest("แก้ผมพัน").some(({ word }) => word === "ชำระเส้นผม"));
});

test("braiding and putting hair up remain distinct styles", () => {
  assert.ok(!thesaurus.suggest("ถักผม").some(({ word }) => word === "มวยผม"));
  assert.ok(!thesaurus.suggest("เกล้าผม").some(({ word }) => word === "ถักเปีย"));
});

test("shaving, trimming facial hair, clipping nails, and filing nails remain distinct", () => {
  assert.ok(!thesaurus.suggest("โกนหนวด").some(({ word }) => word === "ขริบหนวด"));
  assert.ok(!thesaurus.suggest("ตัดเล็บ").some(({ word }) => word === "ฝนขอบเล็บ"));
  assert.ok(!thesaurus.suggest("ตะไบเล็บ").some(({ word }) => word === "โกนเครา"));
});

test("cream, lotion, sunscreen, and powder remain distinct applications", () => {
  assert.ok(!thesaurus.suggest("ทาครีม").some(({ word }) => word === "ลงโลชั่น"));
  assert.ok(!thesaurus.suggest("ทาโลชั่น").some(({ word }) => word === "ลงผลิตภัณฑ์กันแดด"));
  assert.ok(!thesaurus.suggest("ทากันแดด").some(({ word }) => word === "ผัดแป้ง"));
});

test("applying and removing makeup remain opposite routines", () => {
  assert.ok(!thesaurus.suggest("แต่งหน้า").some(({ word }) => word === "เช็ดเครื่องสำอางออก"));
  assert.ok(!thesaurus.suggest("ล้างเครื่องสำอาง").some(({ word }) => word === "ลงเครื่องสำอาง"));
});

test("foundation, brows, eyeliner, lashes, cheeks, and lips remain distinct makeup targets", () => {
  assert.ok(!thesaurus.suggest("ทารองพื้น").some(({ word }) => word === "วาดคิ้ว"));
  assert.ok(!thesaurus.suggest("เขียนคิ้ว").some(({ word }) => word === "วาดเส้นขอบตา"));
  assert.ok(!thesaurus.suggest("ปัดขนตา").some(({ word }) => word === "ลงสีแก้ม"));
  assert.ok(!thesaurus.suggest("ปัดแก้ม").some(({ word }) => word === "ทาลิปสติก"));
});

test("lipstick application and removal remain opposite", () => {
  assert.ok(!thesaurus.suggest("ทาปาก").some(({ word }) => word === "เช็ดสีปาก"));
  assert.ok(!thesaurus.suggest("ลบลิปสติก").some(({ word }) => word === "แต่งริมฝีปาก"));
});

test("personal care vocabulary rises to royal register where applicable", () => {
  assert.equal(thesaurus.suggest("อาบน้ำ").find(({ word }) => word === "สรงน้ำ")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("ล้างหน้า").find(({ word }) => word === "สรงพระพักตร์")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("แปรงฟัน").find(({ word }) => word === "ทรงแปรงพระทนต์")?.register, "ราชาศัพท์");
});

test("personal care and makeup entries preserve verb POS", () => {
  for (const word of ["อาบน้ำ", "ล้างหน้า", "ล้างมือ", "แปรงฟัน", "บ้วนปาก", "เช็ดหน้า", "เช็ดตัว", "เช็ดมือ", "สระผม", "เช็ดผม", "เป่าผม", "หวีผม", "แปรงผม", "แก้ผมพัน", "ถักผม", "เกล้าผม", "โกนหนวด", "เล็มหนวด", "ตัดเล็บ", "ตะไบเล็บ", "ทาครีม", "ทาโลชั่น", "ทากันแดด", "ทาแป้ง", "แต่งหน้า", "ล้างเครื่องสำอาง", "ทารองพื้น", "เขียนคิ้ว", "กรีดตา", "ปัดขนตา", "ปัดแก้ม", "ทาปาก", "ลบลิปสติก", "ฉีดน้ำหอม", "ส่องกระจก"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("opening, closing, and leaving a door ajar remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดประตู").some(({ word }) => word === "ปิดบานประตู"));
  assert.ok(!thesaurus.suggest("ปิดประตู").some(({ word }) => word === "เปิดประตูไว้เล็กน้อย"));
  assert.ok(!thesaurus.suggest("แง้มประตู").some(({ word }) => word === "เปิดทางเข้า"));
});

test("pushing and pulling a door open remain opposite force directions", () => {
  assert.ok(!thesaurus.suggest("ผลักประตูเปิด").some(({ word }) => word === "ดึงบานประตูออก"));
  assert.ok(!thesaurus.suggest("ดึงประตูเปิด").some(({ word }) => word === "ใช้แรงผลักบานประตู"));
});

test("locking and unlocking a door remain opposite security actions", () => {
  assert.ok(!thesaurus.suggest("ล็อกประตู").some(({ word }) => word === "เปิดกลอนประตู"));
  assert.ok(!thesaurus.suggest("ปลดล็อกประตู").some(({ word }) => word === "ปิดประตูใส่กลอน"));
});

test("window opening, closing, and leaving ajar remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดหน้าต่าง").some(({ word }) => word === "ปิดบานหน้าต่าง"));
  assert.ok(!thesaurus.suggest("แง้มหน้าต่าง").some(({ word }) => word === "ผลักหน้าต่างออก"));
});

test("curtain opening, closing, parting, gathering, and releasing remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดม่าน").some(({ word }) => word === "รูดม่านปิด"));
  assert.ok(!thesaurus.suggest("แง้มม่าน").some(({ word }) => word === "ชักม่านบัง"));
  assert.ok(!thesaurus.suggest("รวบม่าน").some(({ word }) => word === "ปล่อยผ้าม่านลง"));
  assert.ok(!thesaurus.suggest("ปล่อยม่าน").some(({ word }) => word === "มัดม่าน"));
});

test("electric light switching and flame ignition remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดไฟ").some(({ word }) => word === "ก่อไฟ"));
  assert.ok(!thesaurus.suggest("ปิดไฟ").some(({ word }) => word === "ดับเปลวไฟ"));
  assert.ok(!thesaurus.suggest("จุดไฟ").some(({ word }) => word === "เปิดสวิตช์ไฟ"));
});

test("candle, lamp, and electric fixture actions remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("จุดเทียน").some(({ word }) => word === "จุดไส้ตะเกียง"));
  assert.ok(!thesaurus.suggest("ดับตะเกียง").some(({ word }) => word === "ปิดไฟโคม"));
  assert.ok(!thesaurus.suggest("เปิดโคมไฟ").some(({ word }) => word === "ทำให้เทียนติดไฟ"));
});

test("brightening and dimming remain opposite light adjustments", () => {
  assert.ok(!thesaurus.suggest("เพิ่มแสง").some(({ word }) => word === "ลดแสงไฟ"));
  assert.ok(!thesaurus.suggest("หรี่ไฟ").some(({ word }) => word === "เร่งไฟให้สว่าง"));
});

test("fan and air conditioner switching remain distinct appliances", () => {
  assert.ok(!thesaurus.suggest("เปิดพัดลม").some(({ word }) => word === "เปิดแอร์"));
  assert.ok(!thesaurus.suggest("ปิดเครื่องปรับอากาศ").some(({ word }) => word === "หยุดเครื่องพัดลม"));
});

test("fireplace lighting, extinguishing, fueling, and stirring remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดเตาผิง").some(({ word }) => word === "ดับไฟในเตาผิง"));
  assert.ok(!thesaurus.suggest("เติมฟืน").some(({ word }) => word === "เขี่ยถ่าน"));
  assert.ok(!thesaurus.suggest("เขี่ยไฟ").some(({ word }) => word === "ทำให้ไฟเตาผิงมอด"));
});

test("room environment entries preserve verb POS", () => {
  for (const word of ["เปิดประตู", "ปิดประตู", "แง้มประตู", "ผลักประตูเปิด", "ดึงประตูเปิด", "ล็อกประตู", "ปลดล็อกประตู", "เปิดหน้าต่าง", "ปิดหน้าต่าง", "แง้มหน้าต่าง", "เปิดม่าน", "ปิดม่าน", "แง้มม่าน", "รวบม่าน", "ปล่อยม่าน", "เปิดไฟ", "ปิดไฟ", "จุดไฟ", "ดับไฟ", "จุดเทียน", "ดับเทียน", "จุดตะเกียง", "ดับตะเกียง", "เปิดโคมไฟ", "ปิดโคมไฟ", "เพิ่มแสง", "หรี่ไฟ", "เปิดพัดลม", "ปิดพัดลม", "เปิดเครื่องปรับอากาศ", "ปิดเครื่องปรับอากาศ", "ระบายอากาศ", "เปิดเตาผิง", "ดับเตาผิง", "เติมฟืน", "เขี่ยไฟ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("door, floor, and stair sounds remain distinct sources", () => {
  assert.ok(!thesaurus.suggest("ประตูส่งเสียง").some(({ word }) => word === "แผ่นไม้คราง"));
  assert.ok(!thesaurus.suggest("พื้นไม้ลั่น").some(({ word }) => word === "บันไดไม้คราง"));
  assert.ok(!thesaurus.suggest("บันไดลั่น").some(({ word }) => word === "บานประตูคราง"));
});

test("loud and faint footsteps remain distinct intensities", () => {
  assert.ok(!thesaurus.suggest("ฝีเท้าดัง").some(({ word }) => word === "เสียงเท้าเบาบาง"));
  assert.ok(!thesaurus.suggest("ฝีเท้าแผ่ว").some(({ word }) => word === "เสียงย่ำเท้าก้อง"));
});

test("knocking and pounding a door remain distinct force levels", () => {
  assert.ok(!thesaurus.suggest("เคาะประตู").some(({ word }) => word === "กระหน่ำทุบประตู"));
  assert.ok(!thesaurus.suggest("ทุบประตู").some(({ word }) => word === "ใช้ข้อนิ้วกระทบประตู"));
});

test("glass breaking and an object falling remain distinct events", () => {
  assert.ok(!thesaurus.suggest("แก้วแตก").some(({ word }) => word === "วัตถุตกลงพื้น"));
  assert.ok(!thesaurus.suggest("ของตกกระทบพื้น").some(({ word }) => word === "แก้วร้าวกระจาย"));
});

test("breeze, gust, and whistling wind remain distinct wind behavior", () => {
  assert.ok(!thesaurus.suggest("ลมพัด").some(({ word }) => word === "กระแสลมพัดแรง"));
  assert.ok(!thesaurus.suggest("ลมกระโชก").some(({ word }) => word === "สายลมครวญ"));
  assert.ok(!thesaurus.suggest("ลมหวีดหวิว").some(({ word }) => word === "สายลมโชย"));
});

test("rain starting, intensifying, easing, and stopping remain distinct", () => {
  assert.ok(!thesaurus.suggest("ฝนตก").some(({ word }) => word === "ฝนกระหน่ำ"));
  assert.ok(!thesaurus.suggest("ฝนตกหนัก").some(({ word }) => word === "ฝนเบาบางลง"));
  assert.ok(!thesaurus.suggest("ฝนซา").some(({ word }) => word === "ฝนขาดเม็ด"));
  assert.ok(!thesaurus.suggest("ฝนหยุด").some(({ word }) => word === "สายฝนหลั่งลงมา"));
});

test("thunder and lightning remain distinct storm events", () => {
  assert.ok(!thesaurus.suggest("ฟ้าร้อง").some(({ word }) => word === "สายฟ้าฟาด"));
  assert.ok(!thesaurus.suggest("ฟ้าผ่า").some(({ word }) => word === "ฟ้าส่งเสียงครืน"));
  assert.ok(thesaurus.suggest("ฟ้าร้อง").every(({ pos }) => pos.length === 1 && pos.includes("ก.")));
  assert.ok(thesaurus.suggest("ฟ้าผ่า").every(({ pos }) => pos.length === 1 && pos.includes("ก.")));
});

test("flame flare and fire crackle remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปลวไฟปะทุ").some(({ word }) => word === "ฟืนลั่นเปรี๊ยะ"));
  assert.ok(!thesaurus.suggest("ไฟแตกเปรี๊ยะ").some(({ word }) => word === "เปลวเพลิงพลุ่ง"));
});

test("flowing water, dripping water, and breaking waves remain distinct", () => {
  assert.ok(!thesaurus.suggest("น้ำไหล").some(({ word }) => word === "น้ำหยดติ๋ง"));
  assert.ok(!thesaurus.suggest("น้ำหยด").some(({ word }) => word === "คลื่นกระแทกฝั่ง"));
  assert.ok(!thesaurus.suggest("คลื่นซัด").some(({ word }) => word === "ธารน้ำไหล"));
});

test("leaf motion and leaf friction remain distinct", () => {
  assert.ok(!thesaurus.suggest("ใบไม้ไหว").some(({ word }) => word === "ใบไม้สีกัน"));
  assert.ok(!thesaurus.suggest("ใบไม้เสียดสี").some(({ word }) => word === "พุ่มใบส่าย"));
});

test("ambient sound events preserve verb POS", () => {
  for (const word of ["ประตูส่งเสียง", "ประตูดังเอี๊ยด", "พื้นไม้ลั่น", "บันไดลั่น", "ฝีเท้าดัง", "ฝีเท้าแผ่ว", "เคาะประตู", "ทุบประตู", "แก้วแตก", "ของตกกระทบพื้น", "ลมพัด", "ลมกระโชก", "ลมหวีดหวิว", "ฝนตก", "ฝนตกหนัก", "ฝนซา", "ฝนหยุด", "ฟ้าร้อง", "ฟ้าผ่า", "เปลวไฟปะทุ", "ไฟแตกเปรี๊ยะ", "น้ำไหล", "น้ำหยด", "คลื่นซัด", "ใบไม้ไหว", "ใบไม้เสียดสี"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("ambient sound qualities preserve adjective POS", () => {
  for (const word of ["เงียบกริบ", "เงียบสงัด", "แผ่วเบา", "ก้องกังวาน", "อื้ออึง", "ครึกโครม", "กรอบแกรบ", "เอี๊ยดอ๊าด", "ครืนครั่น", "ซู่ซ่า"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ว.")), word);
  }
});

test("spooning, chopstick picking, fork piercing, and knife cutting remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตักอาหาร").some(({ word }) => word === "หนีบอาหารด้วยตะเกียบ"));
  assert.ok(!thesaurus.suggest("คีบอาหาร").some(({ word }) => word === "ใช้ส้อมจิ้มอาหาร"));
  assert.ok(!thesaurus.suggest("จิ้มอาหาร").some(({ word }) => word === "ใช้มีดหั่นอาหาร"));
});

test("small bite, large bite, and nibbling remain distinct bite sizes", () => {
  assert.ok(!thesaurus.suggest("กัดคำเล็ก").some(({ word }) => word === "งับคำโต"));
  assert.ok(!thesaurus.suggest("กัดคำใหญ่").some(({ word }) => word === "ขบกินทีละน้อย"));
  assert.ok(!thesaurus.suggest("แทะอาหาร").some(({ word }) => word === "กัดเต็มคำ"));
});

test("slow and fast chewing remain opposite rates", () => {
  assert.ok(!thesaurus.suggest("เคี้ยวช้า").some(({ word }) => word === "รีบเคี้ยว"));
  assert.ok(!thesaurus.suggest("เคี้ยวเร็ว").some(({ word }) => word === "บดเคี้ยวเนิบช้า"));
});

test("swallowing, forced swallowing, and spitting food remain distinct", () => {
  assert.ok(!thesaurus.suggest("กลืนอาหาร").some(({ word }) => word === "บ้วนอาหารออก"));
  assert.ok(!thesaurus.suggest("ฝืนกลืน").some(({ word }) => word === "กลืนคำอาหาร"));
  assert.ok(!thesaurus.suggest("คายอาหาร").some(({ word }) => word === "บังคับตนให้กลืน"));
});

test("choking on food and choking on water remain distinct causes", () => {
  assert.ok(!thesaurus.suggest("สำลักอาหาร").some(({ word }) => word === "ไอเพราะน้ำ"));
  assert.ok(!thesaurus.suggest("สำลักน้ำ").some(({ word }) => word === "อาหารติดคอ"));
});

test("sipping, drinking at once, tilting a glass, and sipping soup remain distinct", () => {
  assert.ok(!thesaurus.suggest("จิบเครื่องดื่ม").some(({ word }) => word === "ดื่มหมดในครั้งเดียว"));
  assert.ok(!thesaurus.suggest("ดื่มรวดเดียว").some(({ word }) => word === "ละเลียดดื่ม"));
  assert.ok(!thesaurus.suggest("กระดกแก้ว").some(({ word }) => word === "สูดน้ำแกงเข้าปาก"));
});

test("cooling food and tasting food remain distinct actions", () => {
  assert.ok(!thesaurus.suggest("เป่าอาหาร").some(({ word }) => word === "ลองรส"));
  assert.ok(!thesaurus.suggest("ชิมอาหาร").some(({ word }) => word === "เป่าให้เย็น"));
});

test("lip licking and mouth wiping remain distinct", () => {
  assert.ok(!thesaurus.suggest("เลียริมฝีปาก").some(({ word }) => word === "ซับปาก"));
  assert.ok(!thesaurus.suggest("เช็ดปาก").some(({ word }) => word === "ไล้ลิ้นบนริมฝีปาก"));
});

test("lifting and setting down cups and glasses remain opposite and vessel-specific", () => {
  assert.ok(!thesaurus.suggest("ยกแก้ว").some(({ word }) => word === "วางแก้วลง"));
  assert.ok(!thesaurus.suggest("วางแก้ว").some(({ word }) => word === "หยิบถ้วยขึ้น"));
  assert.ok(!thesaurus.suggest("ยกถ้วย").some(({ word }) => word === "ตั้งแก้วบนโต๊ะ"));
  assert.ok(!thesaurus.suggest("วางถ้วย").some(({ word }) => word === "ชูแก้วขึ้น"));
});

test("spoon and fork placement remain utensil-specific", () => {
  assert.ok(!thesaurus.suggest("วางช้อน").some(({ word }) => word === "วางส้อมลง"));
  assert.ok(!thesaurus.suggest("วางส้อม").some(({ word }) => word === "ปล่อยช้อนบนโต๊ะ"));
});

test("pouring, refilling, passing, sliding, and clearing remain distinct table actions", () => {
  assert.ok(!thesaurus.suggest("รินน้ำ").some(({ word }) => word === "รินน้ำเพิ่ม"));
  assert.ok(!thesaurus.suggest("เติมน้ำ").some(({ word }) => word === "เทน้ำลงแก้ว"));
  assert.ok(!thesaurus.suggest("ยื่นจาน").some(({ word }) => word === "ดันจานไป"));
  assert.ok(!thesaurus.suggest("เลื่อนจาน").some(({ word }) => word === "นำจานออก"));
});

test("feeding, declining, taking more, finishing, and leaving food remain distinct", () => {
  assert.ok(!thesaurus.suggest("ป้อนอาหาร").some(({ word }) => word === "ไม่รับอาหาร"));
  assert.ok(!thesaurus.suggest("ปฏิเสธอาหาร").some(({ word }) => word === "ตักเพิ่ม"));
  assert.ok(!thesaurus.suggest("กินจนหมด").some(({ word }) => word === "เหลืออาหารไว้"));
  assert.ok(!thesaurus.suggest("กินไม่หมด").some(({ word }) => word === "รับประทานจนหมด"));
});

test("meal action entries preserve verb POS", () => {
  for (const word of ["ตักอาหาร", "คีบอาหาร", "จิ้มอาหาร", "หั่นอาหาร", "กัดคำเล็ก", "กัดคำใหญ่", "แทะอาหาร", "เคี้ยวอาหาร", "เคี้ยวช้า", "เคี้ยวเร็ว", "กลืนอาหาร", "ฝืนกลืน", "สำลักอาหาร", "สำลักน้ำ", "คายอาหาร", "จิบเครื่องดื่ม", "ดื่มรวดเดียว", "กระดกแก้ว", "ซดน้ำแกง", "เป่าอาหาร", "ชิมอาหาร", "เลียริมฝีปาก", "เช็ดปาก", "ยกแก้ว", "วางแก้ว", "ยกถ้วย", "วางถ้วย", "วางช้อน", "วางส้อม", "รินน้ำ", "เติมน้ำ", "ยื่นจาน", "เลื่อนจาน", "เก็บจาน", "ป้อนอาหาร", "ปฏิเสธอาหาร", "ตักอาหารเพิ่ม", "กินจนหมด", "กินไม่หมด"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("going to bed, getting onto bed, and getting off bed remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้านอน").some(({ word }) => word === "ก้าวลงจากเตียง"));
  assert.ok(!thesaurus.suggest("ขึ้นเตียง").some(({ word }) => word === "ออกจากที่นอน"));
  assert.ok(!thesaurus.suggest("ลงจากเตียง").some(({ word }) => word === "เข้าสู่ที่นอน"));
});

test("lying down and getting up from bed remain opposite transitions", () => {
  assert.ok(!thesaurus.suggest("ล้มตัวลงนอน").some(({ word }) => word === "ผุดลุกจากเตียง"));
  assert.ok(!thesaurus.suggest("ลุกจากเตียง").some(({ word }) => word === "เอนกายลงบนเตียง"));
});

test("blanket covering, pulling up, kicking off, and covering the head remain distinct", () => {
  assert.ok(!thesaurus.suggest("ซุกตัวใต้ผ้าห่ม").some(({ word }) => word === "สลัดผ้าห่มออก"));
  assert.ok(!thesaurus.suggest("ดึงผ้าห่มขึ้น").some(({ word }) => word === "เตะผ้าห่มพ้นตัว"));
  assert.ok(!thesaurus.suggest("คลุมโปง").some(({ word }) => word === "ห่มผ้าให้สูงขึ้น"));
});

test("using, flipping, hugging, and arranging a pillow remain distinct", () => {
  assert.ok(!thesaurus.suggest("หนุนหมอน").some(({ word }) => word === "กลับด้านหมอน"));
  assert.ok(!thesaurus.suggest("พลิกหมอน").some(({ word }) => word === "ก่ายหมอน"));
  assert.ok(!thesaurus.suggest("กอดหมอน").some(({ word }) => word === "จัดตำแหน่งหมอน"));
});

test("closing eyes and opening eyes on waking remain opposite", () => {
  assert.ok(!thesaurus.suggest("หลับตา").some(({ word }) => word === "เปิดตาตื่น"));
  assert.ok(!thesaurus.suggest("ลืมตาตื่น").some(({ word }) => word === "ปิดเปลือกตา"));
});

test("dozing off, unintentionally falling asleep, and deep sleep remain distinct", () => {
  assert.ok(!thesaurus.suggest("เคลิ้มหลับ").some(({ word }) => word === "หลับไปโดยไม่รู้ตัว"));
  assert.ok(!thesaurus.suggest("ผล็อยหลับ").some(({ word }) => word === "หลับใหลเต็มที่"));
  assert.ok(!thesaurus.suggest("หลับสนิท").some(({ word }) => word === "เริ่มเคลิ้ม"));
});

test("broken sleep and waking with a start remain distinct", () => {
  assert.ok(!thesaurus.suggest("หลับๆ ตื่นๆ").some(({ word }) => word === "ตื่นพรวด"));
  assert.ok(!thesaurus.suggest("สะดุ้งตื่น").some(({ word }) => word === "ตื่นสลับหลับ"));
});

test("waking at night, early, and late remain distinct times", () => {
  assert.ok(!thesaurus.suggest("ตื่นกลางดึก").some(({ word }) => word === "ลุกในเวลาเช้า"));
  assert.ok(!thesaurus.suggest("ตื่นเช้า").some(({ word }) => word === "ตื่นจนสาย"));
  assert.ok(!thesaurus.suggest("ตื่นสาย").some(({ word }) => word === "ตื่นยามดึก"));
});

test("eye rubbing, yawning, stretching, and grogginess remain distinct", () => {
  assert.ok(!thesaurus.suggest("ขยี้ตา").some(({ word }) => word === "อ้าปากหาว"));
  assert.ok(!thesaurus.suggest("หาว").some(({ word }) => word === "ยืดเส้นยืดสาย"));
  assert.ok(!thesaurus.suggest("บิดขี้เกียจ").some(({ word }) => word === "สะลึมสะลือ"));
});

test("setting, stopping, and snoozing an alarm remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตั้งนาฬิกาปลุก").some(({ word }) => word === "ปิดเสียงเตือน"));
  assert.ok(!thesaurus.suggest("ปิดนาฬิกาปลุก").some(({ word }) => word === "หน่วงเวลาปลุก"));
  assert.ok(!thesaurus.suggest("เลื่อนปลุก").some(({ word }) => word === "กำหนดเวลาปลุก"));
});

test("folding blankets, making beds, changing pillowcases, and laying bedding remain distinct", () => {
  assert.ok(!thesaurus.suggest("พับผ้าห่ม").some(({ word }) => word === "จัดเครื่องนอน"));
  assert.ok(!thesaurus.suggest("จัดเตียง").some(({ word }) => word === "สวมปลอกหมอนใหม่"));
  assert.ok(!thesaurus.suggest("เปลี่ยนปลอกหมอน").some(({ word }) => word === "จัดปูที่นอน"));
});

test("sleep and bedside actions preserve verb POS while grogginess stays adjective", () => {
  for (const word of ["เข้านอน", "ขึ้นเตียง", "ลงจากเตียง", "ล้มตัวลงนอน", "ซุกตัวใต้ผ้าห่ม", "ดึงผ้าห่มขึ้น", "ถีบผ้าห่มออก", "คลุมโปง", "หนุนหมอน", "พลิกหมอน", "กอดหมอน", "จัดหมอน", "หลับตา", "ลืมตาตื่น", "เคลิ้มหลับ", "ผล็อยหลับ", "หลับสนิท", "หลับๆ ตื่นๆ", "สะดุ้งตื่น", "ตื่นกลางดึก", "ตื่นเช้า", "ตื่นสาย", "ลุกจากเตียง", "นั่งบนเตียง", "ขยี้ตา", "หาว", "บิดขี้เกียจ", "ฝันดี", "ตั้งนาฬิกาปลุก", "ปิดนาฬิกาปลุก", "เลื่อนปลุก", "พับผ้าห่ม", "จัดเตียง", "เปลี่ยนปลอกหมอน", "ปูที่นอน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  assert.ok(thesaurus.suggest("งัวเงีย").every(({ pos }) => pos.length === 1 && pos.includes("ว.")));
});

test("opening and closing a car door remain opposite", () => {
  assert.ok(!thesaurus.suggest("เปิดประตูรถ").some(({ word }) => word === "ปิดบานประตูรถ"));
  assert.ok(!thesaurus.suggest("ปิดประตูรถ").some(({ word }) => word === "ดึงประตูรถเปิด"));
});

test("getting into and out of a car remain opposite", () => {
  assert.ok(!thesaurus.suggest("ขึ้นรถ").some(({ word }) => word === "ออกจากยานพาหนะ"));
  assert.ok(!thesaurus.suggest("ลงจากรถ").some(({ word }) => word === "เข้าโดยสารรถ"));
});

test("front and rear seats remain distinct", () => {
  assert.ok(!thesaurus.suggest("นั่งเบาะหน้า").some(({ word }) => word === "นั่งที่นั่งตอนหลัง"));
  assert.ok(!thesaurus.suggest("นั่งเบาะหลัง").some(({ word }) => word === "นั่งด้านหน้ารถ"));
});

test("fastening and releasing a seat belt remain opposite", () => {
  assert.ok(!thesaurus.suggest("คาดเข็มขัดนิรภัย").some(({ word }) => word === "แกะเข็มขัดนิรภัย"));
  assert.ok(!thesaurus.suggest("ปลดเข็มขัดนิรภัย").some(({ word }) => word === "รัดเข็มขัดนิรภัย"));
});

test("starting and stopping an engine remain opposite", () => {
  assert.ok(!thesaurus.suggest("สตาร์ตรถ").some(({ word }) => word === "ดับเครื่อง"));
  assert.ok(!thesaurus.suggest("ดับเครื่องยนต์").some(({ word }) => word === "เดินเครื่องยนต์"));
});

test("parking brake release and engagement remain opposite", () => {
  assert.ok(!thesaurus.suggest("ปลดเบรกมือ").some(({ word }) => word === "ใช้เบรกจอดรถ"));
  assert.ok(!thesaurus.suggest("ดึงเบรกมือ").some(({ word }) => word === "ปล่อยเบรกจอดรถ"));
});

test("accelerating, easing off, braking, and emergency braking remain distinct", () => {
  assert.ok(!thesaurus.suggest("เหยียบคันเร่ง").some(({ word }) => word === "ลดแรงกดคันเร่ง"));
  assert.ok(!thesaurus.suggest("ผ่อนคันเร่ง").some(({ word }) => word === "กดเบรก"));
  assert.ok(!thesaurus.suggest("เหยียบเบรก").some(({ word }) => word === "หยุดรถอย่างฉับพลัน"));
});

test("left turn, right turn, U-turn, and reversing remain distinct directions", () => {
  assert.ok(!thesaurus.suggest("เลี้ยวซ้าย").some(({ word }) => word === "หักรถไปทางขวา"));
  assert.ok(!thesaurus.suggest("เลี้ยวขวา").some(({ word }) => word === "หมุนรถกลับทิศ"));
  assert.ok(!thesaurus.suggest("กลับรถ").some(({ word }) => word === "ขับถอยหลัง"));
});

test("moving off, slowing, stopping, and parking remain distinct vehicle states", () => {
  assert.ok(!thesaurus.suggest("ออกรถ").some(({ word }) => word === "หยุดยานพาหนะ"));
  assert.ok(!thesaurus.suggest("ชะลอรถ").some(({ word }) => word === "จอดยานพาหนะ"));
  assert.ok(!thesaurus.suggest("หยุดรถ").some(({ word }) => word === "เคลื่อนรถออก"));
});

test("parking, pulling alongside, and roadside stopping remain distinct", () => {
  assert.ok(!thesaurus.suggest("จอดรถ").some(({ word }) => word === "จอดเทียบขอบทาง"));
  assert.ok(!thesaurus.suggest("จอดเทียบ").some(({ word }) => word === "นำรถหยุดข้างทาง"));
  assert.ok(!thesaurus.suggest("จอดข้างทาง").some(({ word }) => word === "นำรถเข้าเทียบ"));
});

test("fast and slow driving remain opposite while overtaking and lane changes stay distinct", () => {
  assert.ok(!thesaurus.suggest("ขับเร็ว").some(({ word }) => word === "ขับด้วยความเร็วต่ำ"));
  assert.ok(!thesaurus.suggest("ขับช้า").some(({ word }) => word === "ซิ่งรถ"));
  assert.ok(!thesaurus.suggest("แซงรถ").some(({ word }) => word === "ย้ายช่องจราจร"));
});

test("red-light waiting, green-light passage, and arrival remain distinct", () => {
  assert.ok(!thesaurus.suggest("ติดไฟแดง").some(({ word }) => word === "ขับผ่านสัญญาณเขียว"));
  assert.ok(!thesaurus.suggest("ผ่านไฟเขียว").some(({ word }) => word === "มาถึงจุดหมาย"));
  assert.ok(!thesaurus.suggest("ถึงที่หมาย").some(({ word }) => word === "จอดรอไฟแดง"));
});

test("vehicle and journey entries preserve verb POS", () => {
  for (const word of ["เปิดประตูรถ", "ปิดประตูรถ", "ขึ้นรถ", "ลงจากรถ", "นั่งเบาะหน้า", "นั่งเบาะหลัง", "คาดเข็มขัดนิรภัย", "ปลดเข็มขัดนิรภัย", "สตาร์ตรถ", "ดับเครื่องยนต์", "เข้าเกียร์", "เปลี่ยนเกียร์", "ปลดเบรกมือ", "ดึงเบรกมือ", "เหยียบคันเร่ง", "ผ่อนคันเร่ง", "เหยียบเบรก", "เบรกกะทันหัน", "หมุนพวงมาลัย", "เลี้ยวซ้าย", "เลี้ยวขวา", "กลับรถ", "ถอยรถ", "ออกรถ", "ชะลอรถ", "หยุดรถ", "จอดรถ", "จอดเทียบ", "จอดข้างทาง", "ขับรถ", "ขับเร็ว", "ขับช้า", "แซงรถ", "เปลี่ยนเลน", "ติดไฟแดง", "ผ่านไฟเขียว", "ถึงที่หมาย"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("picking up and setting down a phone remain opposite", () => {
  assert.ok(!thesaurus.suggest("หยิบโทรศัพท์").some(({ word }) => word === "วางเครื่องลง"));
  assert.ok(!thesaurus.suggest("วางโทรศัพท์").some(({ word }) => word === "คว้าโทรศัพท์"));
});

test("unlocking a phone and locking its screen remain opposite", () => {
  assert.ok(!thesaurus.suggest("ปลดล็อกโทรศัพท์").some(({ word }) => word === "ล็อกโทรศัพท์"));
  assert.ok(!thesaurus.suggest("ล็อกหน้าจอ").some(({ word }) => word === "เปิดการเข้าถึงโทรศัพท์"));
});

test("turning a screen on and off remain opposite", () => {
  assert.ok(!thesaurus.suggest("เปิดหน้าจอ").some(({ word }) => word === "ดับหน้าจอ"));
  assert.ok(!thesaurus.suggest("ปิดหน้าจอ").some(({ word }) => word === "เปิดการแสดงผล"));
});

test("outgoing, accepting, rejecting, ending, and returning calls remain distinct", () => {
  assert.ok(!thesaurus.suggest("โทรออก").some(({ word }) => word === "ตอบรับสายโทรเข้า"));
  assert.ok(!thesaurus.suggest("รับสาย").some(({ word }) => word === "กดตัดสาย"));
  assert.ok(!thesaurus.suggest("ปฏิเสธสาย").some(({ word }) => word === "ติดต่อกลับทางโทรศัพท์"));
  assert.ok(!thesaurus.suggest("วางสาย").some(({ word }) => word === "กดรับ"));
});

test("busy status and failed connection remain distinct", () => {
  assert.ok(!thesaurus.suggest("สายไม่ว่าง").some(({ word }) => word === "เชื่อมต่อสายไม่สำเร็จ"));
  assert.ok(!thesaurus.suggest("โทรไม่ติด").some(({ word }) => word === "ไม่พร้อมรับสาย"));
});

test("holding and transferring a call remain distinct", () => {
  assert.ok(!thesaurus.suggest("รอสาย").some(({ word }) => word === "ส่งต่อสาย"));
  assert.ok(!thesaurus.suggest("โอนสาย").some(({ word }) => word === "คงการเชื่อมต่อไว้"));
});

test("speaker and microphone toggles remain device-specific and opposite", () => {
  assert.ok(!thesaurus.suggest("เปิดลำโพง").some(({ word }) => word === "ปิดสปีกเกอร์"));
  assert.ok(!thesaurus.suggest("ปิดลำโพง").some(({ word }) => word === "เปิดไมค์"));
  assert.ok(!thesaurus.suggest("เปิดไมโครโฟน").some(({ word }) => word === "ระงับเสียงไมโครโฟน"));
});

test("typing, deleting, editing, copying, and pasting text remain distinct", () => {
  assert.ok(!thesaurus.suggest("พิมพ์ข้อความ").some(({ word }) => word === "นำข้อความออก"));
  assert.ok(!thesaurus.suggest("ลบข้อความ").some(({ word }) => word === "ปรับแก้เนื้อหา"));
  assert.ok(!thesaurus.suggest("คัดลอกข้อความ").some(({ word }) => word === "วางเนื้อหาที่คัดลอก"));
});

test("opening, rereading, replying, ignoring, and leaving on read remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดอ่านข้อความ").some(({ word }) => word === "ทบทวนข้อความ"));
  assert.ok(!thesaurus.suggest("อ่านข้อความซ้ำ").some(({ word }) => word === "ส่งคำตอบกลับ"));
  assert.ok(!thesaurus.suggest("ตอบข้อความ").some(({ word }) => word === "งดตอบข้อความ"));
  assert.ok(!thesaurus.suggest("อ่านแล้วไม่ตอบ").some(({ word }) => word === "ตอบแชต"));
});

test("photo, file, and location sharing remain distinct payloads", () => {
  assert.ok(!thesaurus.suggest("ส่งรูป").some(({ word }) => word === "แนบไฟล์"));
  assert.ok(!thesaurus.suggest("ส่งไฟล์").some(({ word }) => word === "ส่งพิกัด"));
  assert.ok(!thesaurus.suggest("ส่งตำแหน่ง").some(({ word }) => word === "ส่งรูปภาพ"));
});

test("recording audio and sending a voice message remain distinct", () => {
  assert.ok(!thesaurus.suggest("บันทึกเสียง").some(({ word }) => word === "ส่งคลิปเสียง"));
  assert.ok(!thesaurus.suggest("ส่งข้อความเสียง").some(({ word }) => word === "บันทึกคลิปเสียง"));
});

test("video calling and camera toggles remain distinct", () => {
  assert.ok(!thesaurus.suggest("โทรวิดีโอ").some(({ word }) => word === "หยุดการส่งภาพ"));
  assert.ok(!thesaurus.suggest("เปิดกล้อง").some(({ word }) => word === "ปิดวิดีโอ"));
  assert.ok(!thesaurus.suggest("ปิดกล้อง").some(({ word }) => word === "เปิดการส่งภาพ"));
});

test("phone and messaging actions preserve POS while busy status stays adjective", () => {
  for (const word of ["หยิบโทรศัพท์", "วางโทรศัพท์", "ปลดล็อกโทรศัพท์", "ล็อกหน้าจอ", "เปิดหน้าจอ", "ปิดหน้าจอ", "โทรออก", "รับสาย", "ปฏิเสธสาย", "วางสาย", "โทรกลับ", "โทรไม่ติด", "รอสาย", "โอนสาย", "เปิดลำโพง", "ปิดลำโพง", "เปิดไมโครโฟน", "ปิดไมโครโฟน", "พิมพ์ข้อความ", "ลบข้อความ", "แก้ไขข้อความ", "คัดลอกข้อความ", "วางข้อความ", "เปิดอ่านข้อความ", "อ่านข้อความซ้ำ", "ตอบข้อความ", "ไม่ตอบข้อความ", "อ่านแล้วไม่ตอบ", "ส่งรูป", "ส่งไฟล์", "ส่งตำแหน่ง", "บันทึกเสียง", "ส่งข้อความเสียง", "โทรวิดีโอ", "เปิดกล้อง", "ปิดกล้อง", "ปิดแจ้งเตือน", "เปิดโหมดเงียบ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  assert.ok(thesaurus.suggest("สายไม่ว่าง").every(({ pos }) => pos.length === 1 && pos.includes("ว.")));
});

test("opening and closing notebooks and books remain opposite and object-specific", () => {
  assert.ok(!thesaurus.suggest("เปิดสมุด").some(({ word }) => word === "พับสมุดปิด"));
  assert.ok(!thesaurus.suggest("ปิดสมุด").some(({ word }) => word === "เปิดหน้าหนังสือ"));
  assert.ok(!thesaurus.suggest("เปิดหนังสือ").some(({ word }) => word === "ประกบปกหนังสือ"));
});

test("turning forward, returning a page, and bookmarking remain distinct", () => {
  assert.ok(!thesaurus.suggest("พลิกหน้า").some(({ word }) => word === "พลิกกลับหน้าเดิม"));
  assert.ok(!thesaurus.suggest("ย้อนหน้า").some(({ word }) => word === "สอดที่คั่นหน้า"));
  assert.ok(!thesaurus.suggest("คั่นหน้า").some(({ word }) => word === "พลิกไปหน้าถัดไป"));
});

test("picking up, setting down, and holding a pen remain distinct", () => {
  assert.ok(!thesaurus.suggest("หยิบปากกา").some(({ word }) => word === "วางปากกาลง"));
  assert.ok(!thesaurus.suggest("วางปากกา").some(({ word }) => word === "กำปากกาไว้"));
  assert.ok(!thesaurus.suggest("จับปากกา").some(({ word }) => word === "คว้าปากกา"));
});

test("dipping a pen, sharpening a pencil, and erasing pencil marks remain distinct", () => {
  assert.ok(!thesaurus.suggest("จุ่มปากกา").some(({ word }) => word === "เหลาไส้ดินสอ"));
  assert.ok(!thesaurus.suggest("เหลาดินสอ").some(({ word }) => word === "ลบเส้นดินสอ"));
  assert.ok(!thesaurus.suggest("ลบรอยดินสอ").some(({ word }) => word === "ชุบปากกาด้วยน้ำหมึก"));
});

test("recording notes, taking a short note, and drafting remain distinct", () => {
  assert.ok(!thesaurus.suggest("เขียนบันทึก").some(({ word }) => word === "เขียนข้อความสั้นไว้"));
  assert.ok(!thesaurus.suggest("จดโน้ต").some(({ word }) => word === "จัดทำข้อความฉบับร่าง"));
  assert.ok(!thesaurus.suggest("ร่างข้อความ").some(({ word }) => word === "บันทึกเป็นลายลักษณ์อักษร"));
});

test("writing and revising a manuscript remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("เขียนต้นฉบับ").some(({ word }) => word === "ปรับแก้ต้นฉบับ"));
  assert.ok(!thesaurus.suggest("แก้ต้นฉบับ").some(({ word }) => word === "แต่งต้นฉบับ"));
});

test("striking out, adding, underlining, circling, and annotating remain distinct marks", () => {
  assert.ok(!thesaurus.suggest("ขีดฆ่า").some(({ word }) => word === "เพิ่มเติมเนื้อความ"));
  assert.ok(!thesaurus.suggest("เติมข้อความ").some(({ word }) => word === "ลากเส้นใต้คำ"));
  assert.ok(!thesaurus.suggest("ขีดเส้นใต้").some(({ word }) => word === "วงกลมรอบคำ"));
  assert.ok(!thesaurus.suggest("วงคำ").some(({ word }) => word === "เพิ่มคำอธิบายกำกับ"));
});

test("proofreading, rereading, skimming, and close reading remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตรวจทาน").some(({ word }) => word === "กวาดตาอ่าน"));
  assert.ok(!thesaurus.suggest("อ่านทวน").some(({ word }) => word === "อ่านอย่างถี่ถ้วน"));
  assert.ok(!thesaurus.suggest("อ่านคร่าว").some(({ word }) => word === "พินิจอ่าน"));
  assert.ok(!thesaurus.suggest("อ่านละเอียด").some(({ word }) => word === "อ่านผ่านๆ"));
});

test("signing and stamping remain distinct authentication acts", () => {
  assert.ok(!thesaurus.suggest("เซ็นชื่อ").some(({ word }) => word === "ลงตราประทับ"));
  assert.ok(!thesaurus.suggest("ประทับตรา").some(({ word }) => word === "ลงลายมือชื่อ"));
});

test("folding and unfolding paper remain opposite", () => {
  assert.ok(!thesaurus.suggest("พับกระดาษ").some(({ word }) => word === "แผ่กระดาษออก"));
  assert.ok(!thesaurus.suggest("คลี่กระดาษ").some(({ word }) => word === "ทบกระดาษ"));
});

test("folding, inserting, sealing, opening, and tearing a letter remain distinct", () => {
  assert.ok(!thesaurus.suggest("พับจดหมาย").some(({ word }) => word === "บรรจุลงในซอง"));
  assert.ok(!thesaurus.suggest("ใส่ซอง").some(({ word }) => word === "ผนึกซองจดหมาย"));
  assert.ok(!thesaurus.suggest("ปิดผนึกซอง").some(({ word }) => word === "เปิดผนึกซอง"));
  assert.ok(!thesaurus.suggest("ฉีกจดหมาย").some(({ word }) => word === "พับกระดาษจดหมาย"));
});

test("sorting, gathering, and clipping documents remain distinct", () => {
  assert.ok(!thesaurus.suggest("เรียงเอกสาร").some(({ word }) => word === "เก็บเอกสารรวมกัน"));
  assert.ok(!thesaurus.suggest("รวบเอกสาร").some(({ word }) => word === "ใช้คลิปหนีบกระดาษ"));
  assert.ok(!thesaurus.suggest("หนีบกระดาษ").some(({ word }) => word === "จัดลำดับเอกสาร"));
});

test("desk, reading, writing, and paper actions preserve verb POS", () => {
  for (const word of ["นั่งโต๊ะทำงาน", "เปิดสมุด", "ปิดสมุด", "เปิดหนังสือ", "ปิดหนังสือ", "พลิกหน้า", "ย้อนหน้า", "คั่นหน้า", "วางหนังสือ", "หยิบปากกา", "วางปากกา", "จับปากกา", "จุ่มปากกา", "เหลาดินสอ", "ลบรอยดินสอ", "เขียนบันทึก", "จดโน้ต", "ร่างข้อความ", "เขียนต้นฉบับ", "แก้ต้นฉบับ", "ขีดฆ่า", "เติมข้อความ", "ขีดเส้นใต้", "วงคำ", "ใส่หมายเหตุ", "ตรวจทาน", "อ่านทวน", "อ่านคร่าว", "อ่านละเอียด", "เซ็นชื่อ", "ประทับตรา", "พับกระดาษ", "คลี่กระดาษ", "พับจดหมาย", "ใส่ซอง", "ปิดผนึกซอง", "เปิดซองจดหมาย", "ฉีกจดหมาย", "เรียงเอกสาร", "รวบเอกสาร", "หนีบกระดาษ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("entering and leaving a shop remain opposite", () => {
  assert.ok(!thesaurus.suggest("เข้าร้าน").some(({ word }) => word === "เดินออกจากร้าน"));
  assert.ok(!thesaurus.suggest("ออกจากร้าน").some(({ word }) => word === "เข้าไปในร้านค้า"));
});

test("browsing, selecting, picking up, and returning goods remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินดูสินค้า").some(({ word }) => word === "คัดเลือกสินค้า"));
  assert.ok(!thesaurus.suggest("เลือกสินค้า").some(({ word }) => word === "หยิบของขึ้น"));
  assert.ok(!thesaurus.suggest("หยิบสินค้า").some(({ word }) => word === "นำสินค้าคืนชั้นวาง"));
});

test("inspecting and trying goods remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตรวจสินค้า").some(({ word }) => word === "ทดลองใช้สินค้า"));
  assert.ok(!thesaurus.suggest("ลองสินค้า").some(({ word }) => word === "ตรวจสอบสภาพสินค้า"));
});

test("asking, stating, labeling, and negotiating price remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถามราคา").some(({ word }) => word === "บอกราคา"));
  assert.ok(!thesaurus.suggest("แจ้งราคา").some(({ word }) => word === "แปะป้ายราคา"));
  assert.ok(!thesaurus.suggest("ติดป้ายราคา").some(({ word }) => word === "ต่อราคา"));
});

test("price reduction and requesting a discount remain seller and buyer actions", () => {
  assert.ok(!thesaurus.suggest("ลดราคา").some(({ word }) => word === "ร้องขอส่วนลด"));
  assert.ok(!thesaurus.suggest("ขอส่วนลด").some(({ word }) => word === "จำหน่ายในราคาต่ำลง"));
});

test("agreeing, declining, ordering, and canceling a purchase remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตกลงซื้อ").some(({ word }) => word === "ปฏิเสธการซื้อ"));
  assert.ok(!thesaurus.suggest("ปฏิเสธซื้อ").some(({ word }) => word === "ดำเนินการสั่งสินค้า"));
  assert.ok(!thesaurus.suggest("สั่งซื้อ").some(({ word }) => word === "เพิกถอนคำสั่งซื้อ"));
});

test("adding to and removing from a basket remain opposite", () => {
  assert.ok(!thesaurus.suggest("ใส่ตะกร้า").some(({ word }) => word === "นำสินค้าออกจากตะกร้า"));
  assert.ok(!thesaurus.suggest("เอาออกจากตะกร้า").some(({ word }) => word === "เพิ่มสินค้าลงตะกร้า"));
});

test("cash, card, QR, and bank transfer payments remain distinct methods", () => {
  assert.ok(!thesaurus.suggest("จ่ายเงินสด").some(({ word }) => word === "รูดบัตร"));
  assert.ok(!thesaurus.suggest("จ่ายด้วยบัตร").some(({ word }) => word === "ชำระผ่านคิวอาร์โค้ด"));
  assert.ok(!thesaurus.suggest("สแกนจ่าย").some(({ word }) => word === "ส่งเงินผ่านบัญชี"));
});

test("paying and receiving payment remain opposite roles", () => {
  assert.ok(!thesaurus.suggest("ชำระเงิน").some(({ word }) => word === "รับการชำระ"));
  assert.ok(!thesaurus.suggest("รับชำระเงิน").some(({ word }) => word === "ดำเนินการชำระ"));
});

test("issuing and receiving receipts remain opposite roles", () => {
  assert.ok(!thesaurus.suggest("ออกใบเสร็จ").some(({ word }) => word === "รับหลักฐานการชำระ"));
  assert.ok(!thesaurus.suggest("รับใบเสร็จ").some(({ word }) => word === "จัดทำหลักฐานการชำระ"));
});

test("receiving change and giving change remain opposite roles", () => {
  assert.ok(!thesaurus.suggest("รับเงินทอน").some(({ word }) => word === "จ่ายเงินทอน"));
  assert.ok(!thesaurus.suggest("ทอนเงิน").some(({ word }) => word === "รับจำนวนเงินที่ทอน"));
});

test("bagging, wrapping, handing over, receiving, and counting goods remain distinct", () => {
  assert.ok(!thesaurus.suggest("ใส่ถุง").some(({ word }) => word === "บรรจุหีบห่อสินค้า"));
  assert.ok(!thesaurus.suggest("ห่อสินค้า").some(({ word }) => word === "ส่งของให้"));
  assert.ok(!thesaurus.suggest("ส่งมอบสินค้า").some(({ word }) => word === "รับมอบสินค้า"));
  assert.ok(!thesaurus.suggest("ตรวจนับสินค้า").some(({ word }) => word === "บรรจุสินค้าลงถุง"));
});

test("returning, exchanging, requesting a refund, and refunding remain distinct", () => {
  assert.ok(!thesaurus.suggest("คืนสินค้า").some(({ word }) => word === "ขอเปลี่ยนสินค้า"));
  assert.ok(!thesaurus.suggest("แลกสินค้า").some(({ word }) => word === "ยื่นคำขอคืนเงิน"));
  assert.ok(!thesaurus.suggest("ขอคืนเงิน").some(({ word }) => word === "จ่ายเงินคืน"));
  assert.ok(!thesaurus.suggest("คืนเงิน").some(({ word }) => word === "ส่งสินค้ากลับ"));
});

test("shopping and payment entries preserve verb POS", () => {
  for (const word of ["เข้าร้าน", "ออกจากร้าน", "เดินดูสินค้า", "เลือกสินค้า", "หยิบสินค้า", "วางสินค้าคืน", "ตรวจสินค้า", "ลองสินค้า", "ถามราคา", "แจ้งราคา", "ติดป้ายราคา", "ต่อรองราคา", "ลดราคา", "ขอส่วนลด", "ตกลงซื้อ", "ปฏิเสธซื้อ", "สั่งซื้อ", "ยกเลิกคำสั่งซื้อ", "ใส่ตะกร้า", "เอาออกจากตะกร้า", "เข้าคิวจ่ายเงิน", "ชำระเงิน", "จ่ายเงินสด", "จ่ายด้วยบัตร", "สแกนจ่าย", "โอนเงิน", "รับชำระเงิน", "ออกใบเสร็จ", "รับใบเสร็จ", "รับเงินทอน", "ทอนเงิน", "ใส่ถุง", "ห่อสินค้า", "ส่งมอบสินค้า", "รับสินค้า", "ตรวจนับสินค้า", "คืนสินค้า", "แลกสินค้า", "ขอคืนเงิน", "คืนเงิน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("opening and closing a storage cabinet remain opposite", () => {
  assert.ok(!thesaurus.suggest("เปิดตู้เก็บของ").some(({ word }) => word === "ปิดบานตู้"));
  assert.ok(!thesaurus.suggest("ปิดตู้เก็บของ").some(({ word }) => word === "เปิดช่องเก็บของ"));
});

test("moving, arranging, putting away, and rummaging through objects remain distinct", () => {
  assert.ok(!thesaurus.suggest("ย้ายของ").some(({ word }) => word === "จัดระเบียบของ"));
  assert.ok(!thesaurus.suggest("จัดของ").some(({ word }) => word === "นำสิ่งของกลับที่เดิม"));
  assert.ok(!thesaurus.suggest("เก็บของเข้าที่").some(({ word }) => word === "รื้อค้นสิ่งของ"));
});

test("sweeping, mopping, dusting, and scrubbing a floor remain distinct", () => {
  assert.ok(!thesaurus.suggest("กวาดพื้น").some(({ word }) => word === "ใช้ไม้ถูพื้น"));
  assert.ok(!thesaurus.suggest("ถูพื้น").some(({ word }) => word === "ปัดละอองฝุ่น"));
  assert.ok(!thesaurus.suggest("ปัดฝุ่น").some(({ word }) => word === "ขัดถูพื้น"));
});

test("wiping a table, glass, and stains remain object-specific", () => {
  assert.ok(!thesaurus.suggest("เช็ดโต๊ะ").some(({ word }) => word === "เช็ดบานกระจก"));
  assert.ok(!thesaurus.suggest("เช็ดกระจก").some(({ word }) => word === "เช็ดรอยเปื้อน"));
  assert.ok(!thesaurus.suggest("เช็ดคราบ").some(({ word }) => word === "ทำความสะอาดโต๊ะ"));
});

test("scrubbing and washing pots remain distinct cleaning intensity", () => {
  assert.ok(!thesaurus.suggest("ขัดหม้อ").some(({ word }) => word === "ชำระล้างหม้อ"));
  assert.ok(!thesaurus.suggest("ล้างหม้อ").some(({ word }) => word === "ขัดคราบในหม้อ"));
});

test("washing plates, glasses, and pots remains vessel-specific", () => {
  assert.ok(!thesaurus.suggest("ล้างจาน").some(({ word }) => word === "ทำความสะอาดแก้ว"));
  assert.ok(!thesaurus.suggest("ล้างแก้ว").some(({ word }) => word === "ทำความสะอาดหม้อ"));
  assert.ok(!thesaurus.suggest("ล้างหม้อ").some(({ word }) => word === "ชำระล้างจาน"));
});

test("turning plates over, air-drying, and towel-drying remain distinct", () => {
  assert.ok(!thesaurus.suggest("คว่ำจาน").some(({ word }) => word === "ปล่อยจานให้แห้ง"));
  assert.ok(!thesaurus.suggest("ผึ่งจาน").some(({ word }) => word === "ซับน้ำจากจาน"));
  assert.ok(!thesaurus.suggest("เช็ดจาน").some(({ word }) => word === "พลิกหน้าจานลง"));
});

test("soaking, scrubbing, wringing, and rinsing laundry remain distinct", () => {
  assert.ok(!thesaurus.suggest("แช่ผ้า").some(({ word }) => word === "ใช้มือขยี้คราบ"));
  assert.ok(!thesaurus.suggest("ขยี้ผ้า").some(({ word }) => word === "บิดน้ำออกจากผ้า"));
  assert.ok(!thesaurus.suggest("บิดผ้า").some(({ word }) => word === "ชำระน้ำยาซักผ้าออก"));
});

test("hanging, taking down, folding, and ironing laundry remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("ตากผ้า").some(({ word }) => word === "เก็บเสื้อผ้าจากราว"));
  assert.ok(!thesaurus.suggest("เก็บผ้าจากราว").some(({ word }) => word === "พับเก็บเสื้อผ้า"));
  assert.ok(!thesaurus.suggest("พับผ้า").some(({ word }) => word === "ใช้เตารีดกดผ้า"));
});

test("hanging a shirt, inserting a hanger, and putting clothes in a wardrobe remain distinct", () => {
  assert.ok(!thesaurus.suggest("แขวนเสื้อ").some(({ word }) => word === "สอดไม้แขวนในเสื้อ"));
  assert.ok(!thesaurus.suggest("ใส่ไม้แขวน").some(({ word }) => word === "นำเสื้อผ้าเข้าตู้"));
  assert.ok(!thesaurus.suggest("เก็บเสื้อเข้าตู้").some(({ word }) => word === "แขวนเสื้อบนราว"));
});

test("opening and tying a trash bag remain opposite preparation states", () => {
  assert.ok(!thesaurus.suggest("เปิดถุงขยะ").some(({ word }) => word === "รัดถุงขยะให้ปิด"));
  assert.ok(!thesaurus.suggest("มัดถุงขยะ").some(({ word }) => word === "กางปากถุงขยะ"));
});

test("discarding, sorting, emptying, and washing trash remain distinct", () => {
  assert.ok(!thesaurus.suggest("ทิ้งขยะ").some(({ word }) => word === "จำแนกประเภทมูลฝอย"));
  assert.ok(!thesaurus.suggest("แยกขยะ").some(({ word }) => word === "เทของเสียออก"));
  assert.ok(!thesaurus.suggest("เทขยะ").some(({ word }) => word === "ทำความสะอาดถังขยะ"));
});

test("house cleaning and laundry entries preserve verb POS", () => {
  for (const word of ["เปิดตู้เก็บของ", "ปิดตู้เก็บของ", "ย้ายของ", "จัดของ", "เก็บของเข้าที่", "รื้อของ", "กวาดพื้น", "ถูพื้น", "ปัดฝุ่น", "เช็ดโต๊ะ", "เช็ดกระจก", "เช็ดคราบ", "ขัดพื้น", "ขัดหม้อ", "ล้างจาน", "ล้างแก้ว", "ล้างหม้อ", "คว่ำจาน", "ผึ่งจาน", "เช็ดจาน", "ซักผ้า", "แช่ผ้า", "ขยี้ผ้า", "บิดผ้า", "ล้างน้ำออกจากผ้า", "ตากผ้า", "เก็บผ้าจากราว", "พับผ้า", "รีดผ้า", "แขวนเสื้อ", "ใส่ไม้แขวน", "เก็บเสื้อเข้าตู้", "เปลี่ยนผ้าปูที่นอน", "ปัดกวาดห้อง", "เปิดถุงขยะ", "มัดถุงขยะ", "ทิ้งขยะ", "แยกขยะ", "เทขยะ", "ล้างถังขยะ", "จัดชั้นวาง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("washing and picking vegetables remain distinct preparation actions", () => {
  assert.ok(!thesaurus.suggest("ล้างผัก").some(({ word }) => word === "เด็ดใบผัก"));
  assert.ok(!thesaurus.suggest("เด็ดผัก").some(({ word }) => word === "ชำระสิ่งสกปรกจากผัก"));
});

test("generic, potato, and fruit peeling remain object-specific", () => {
  assert.ok(!thesaurus.suggest("ปอกมันฝรั่ง").some(({ word }) => word === "ลอกเปลือกผลไม้"));
  assert.ok(!thesaurus.suggest("ปอกผลไม้").some(({ word }) => word === "กำจัดเปลือกมันฝรั่ง"));
});

test("thin slicing, dicing, round slicing, and julienning remain distinct cuts", () => {
  assert.ok(!thesaurus.suggest("หั่นบาง").some(({ word }) => word === "หั่นเป็นลูกเต๋า"));
  assert.ok(!thesaurus.suggest("หั่นเต๋า").some(({ word }) => word === "ตัดขวางเป็นวง"));
  assert.ok(!thesaurus.suggest("หั่นแว่น").some(({ word }) => word === "ซอยเป็นเส้น"));
});

test("mincing meat, grinding spices, pounding chili, and pounding curry paste remain distinct", () => {
  assert.ok(!thesaurus.suggest("สับเนื้อ").some(({ word }) => word === "ทำเครื่องเทศเป็นผง"));
  assert.ok(!thesaurus.suggest("บดเครื่องเทศ").some(({ word }) => word === "โขลกพริก"));
  assert.ok(!thesaurus.suggest("ตำพริก").some(({ word }) => word === "บดส่วนผสมเครื่องแกงในครก"));
});

test("measuring volume and weighing mass remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตวงวัตถุดิบ").some(({ word }) => word === "วัดน้ำหนักวัตถุดิบ"));
  assert.ok(!thesaurus.suggest("ชั่งวัตถุดิบ").some(({ word }) => word === "วัดปริมาตรวัตถุดิบ"));
});

test("pouring, mixing, kneading, and resting dough remain distinct", () => {
  assert.ok(!thesaurus.suggest("เทส่วนผสม").some(({ word }) => word === "รวมวัตถุดิบเข้าด้วยกัน"));
  assert.ok(!thesaurus.suggest("ผสมส่วนผสม").some(({ word }) => word === "ขยำแป้ง"));
  assert.ok(!thesaurus.suggest("นวดแป้ง").some(({ word }) => word === "ปล่อยแป้งให้คลายตัว"));
});

test("heating water, boiling, simmering, and blanching remain distinct", () => {
  assert.ok(!thesaurus.suggest("ต้มน้ำ").some(({ word }) => word === "ให้ความร้อนจนเดือดพล่าน"));
  assert.ok(!thesaurus.suggest("ต้มจนเดือด").some(({ word }) => word === "ต้มไฟอ่อน"));
  assert.ok(!thesaurus.suggest("เคี่ยว").some(({ word }) => word === "จุ่มน้ำร้อนชั่วครู่"));
});

test("steaming, deep frying, shallow frying, and high-heat stir frying remain distinct", () => {
  assert.ok(!thesaurus.suggest("นึ่งอาหาร").some(({ word }) => word === "ทอดแบบจมน้ำมัน"));
  assert.ok(!thesaurus.suggest("ทอดน้ำมันท่วม").some(({ word }) => word === "ทอดแบบน้ำมันตื้น"));
  assert.ok(!thesaurus.suggest("ทอดน้ำมันน้อย").some(({ word }) => word === "เร่งไฟผัดอาหาร"));
});

test("charcoal grilling, oven baking, and flame toasting remain distinct heat methods", () => {
  assert.ok(!thesaurus.suggest("ย่างถ่าน").some(({ word }) => word === "นำเข้าเตาอบ"));
  assert.ok(!thesaurus.suggest("อบเตา").some(({ word }) => word === "ปิ้งไฟ"));
  assert.ok(!thesaurus.suggest("ปิ้ง").some(({ word }) => word === "ทำให้สุกเหนือเตาถ่าน"));
});

test("flipping, stirring, skimming, filtering, and draining remain distinct", () => {
  assert.ok(!thesaurus.suggest("กลับด้านอาหาร").some(({ word }) => word === "กวนอาหารในหม้อ"));
  assert.ok(!thesaurus.suggest("คนหม้อ").some(({ word }) => word === "ตักฟองออก"));
  assert.ok(!thesaurus.suggest("ช้อนฟอง").some(({ word }) => word === "กรองของเหลว"));
  assert.ok(!thesaurus.suggest("กรองน้ำ").some(({ word }) => word === "ระบายของเหลวทิ้ง"));
});

test("salt, sugar, and sauce seasoning remain ingredient-specific", () => {
  assert.ok(!thesaurus.suggest("เติมเกลือ").some(({ word }) => word === "ใส่น้ำตาลเพิ่ม"));
  assert.ok(!thesaurus.suggest("เติมน้ำตาล").some(({ word }) => word === "หยดซอสลงไป"));
  assert.ok(!thesaurus.suggest("เหยาะซอส").some(({ word }) => word === "ปรุงรสด้วยเกลือ"));
});

test("tasting and adjusting flavor remain distinct", () => {
  assert.ok(!thesaurus.suggest("ชิมรส").some(({ word }) => word === "ปรับแต่งรสชาติ"));
  assert.ok(!thesaurus.suggest("ปรับรส").some(({ word }) => word === "ลองชิม"));
});

test("turning off heat and removing a pot remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปิดเตา").some(({ word }) => word === "นำหม้อลงจากเตา"));
  assert.ok(!thesaurus.suggest("ยกหม้อลง").some(({ word }) => word === "หยุดการให้ความร้อน"));
});

test("plating, garnishing, and preparing to serve remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตักใส่จาน").some(({ word }) => word === "โรยเครื่องตกแต่งอาหาร"));
  assert.ok(!thesaurus.suggest("โรยหน้า").some(({ word }) => word === "จัดอาหารพร้อมให้บริการ"));
  assert.ok(!thesaurus.suggest("จัดเสิร์ฟ").some(({ word }) => word === "ตักอาหารลงจาน"));
});

test("food preparation and cooking entries preserve verb POS", () => {
  for (const word of ["ล้างผัก", "เด็ดผัก", "ปอกเปลือก", "ปอกมันฝรั่ง", "ปอกผลไม้", "หั่นบาง", "หั่นเต๋า", "หั่นแว่น", "ซอยผัก", "สับเนื้อ", "บดเครื่องเทศ", "ตำพริก", "โขลกเครื่องแกง", "ตวงวัตถุดิบ", "ชั่งวัตถุดิบ", "เทส่วนผสม", "ผสมส่วนผสม", "นวดแป้ง", "พักแป้ง", "ต้มน้ำ", "ต้มจนเดือด", "เคี่ยว", "ลวก", "นึ่งอาหาร", "ทอดน้ำมันท่วม", "ทอดน้ำมันน้อย", "ผัดไฟแรง", "ย่างถ่าน", "อบเตา", "ปิ้ง", "กลับด้านอาหาร", "คนหม้อ", "ช้อนฟอง", "กรองน้ำ", "เทน้ำทิ้ง", "เติมเกลือ", "เติมน้ำตาล", "เหยาะซอส", "ชิมรส", "ปรับรส", "ปิดเตา", "ยกหม้อลง", "ตักใส่จาน", "โรยหน้า", "จัดเสิร์ฟ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("ordinary cough, dry cough, and coughing blood remain distinct", () => {
  assert.ok(!thesaurus.suggest("ไอ").some(({ word }) => word === "ไอไม่มีเสมหะ"));
  assert.ok(!thesaurus.suggest("ไอแห้ง").some(({ word }) => word === "ขับเลือดออกมากับการไอ"));
  assert.ok(!thesaurus.suggest("ไอเป็นเลือด").some(({ word }) => word === "ไอค่อกแค่ก"));
});

test("sneezing and sniffing remain distinct", () => {
  assert.ok(!thesaurus.suggest("จาม").some(({ word }) => word === "สูดน้ำมูก"));
  assert.ok(!thesaurus.suggest("สูดจมูก").some(({ word }) => word === "ส่งเสียงจาม"));
});

test("runny nose, congestion, hoarse voice, and sore throat remain distinct", () => {
  assert.ok(!thesaurus.suggest("น้ำมูกไหล").some(({ word }) => word === "ทางเดินจมูกอุดตัน"));
  assert.ok(!thesaurus.suggest("คัดจมูก").some(({ word }) => word === "เสียงแหบแห้ง"));
  assert.ok(!thesaurus.suggest("เสียงแหบ").some(({ word }) => word === "ระคายคอ"));
});

test("head, stomach, and wound pain remain location-specific", () => {
  assert.ok(!thesaurus.suggest("ปวดศีรษะ").some(({ word }) => word === "เจ็บท้อง"));
  assert.ok(!thesaurus.suggest("ปวดท้อง").some(({ word }) => word === "เจ็บแผล"));
  assert.ok(!thesaurus.suggest("ปวดแผล").some(({ word }) => word === "ปวดหัว"));
});

test("having fever, rising fever, and chills remain distinct", () => {
  assert.ok(!thesaurus.suggest("มีไข้").some(({ word }) => word === "อุณหภูมิร่างกายสูงขึ้น"));
  assert.ok(!thesaurus.suggest("ไข้ขึ้น").some(({ word }) => word === "หนาวจนตัวสั่น"));
  assert.ok(!thesaurus.suggest("หนาวสั่น").some(({ word }) => word === "ตัวร้อน"));
});

test("ordinary sweating and breaking into sweat remain distinct intensity", () => {
  assert.ok(!thesaurus.suggest("เหงื่อออก").some(({ word }) => word === "เหงื่อไหลพลั่ก"));
  assert.ok(!thesaurus.suggest("เหงื่อแตก").some(({ word }) => word === "มีเหงื่อ"));
});

test("nausea and vomiting remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("คลื่นไส้").some(({ word }) => word === "อ้วก"));
  assert.ok(!thesaurus.suggest("อาเจียน").some(({ word }) => word === "รู้สึกอยากอาเจียน"));
});

test("dizziness, near fainting, staggering, fainting, and recovery remain distinct", () => {
  assert.ok(!thesaurus.suggest("เวียนศีรษะ").some(({ word }) => word === "เกือบหมดสติ"));
  assert.ok(!thesaurus.suggest("หน้ามืด").some(({ word }) => word === "เดินโงนเงน"));
  assert.ok(!thesaurus.suggest("เดินเซ").some(({ word }) => word === "หมดสติ"));
  assert.ok(!thesaurus.suggest("เป็นลม").some(({ word }) => word === "ฟื้นคืนสติ"));
});

test("panting and obstructed breathing remain distinct", () => {
  assert.ok(!thesaurus.suggest("หายใจหอบ").some(({ word }) => word === "หายใจไม่สะดวก"));
  assert.ok(!thesaurus.suggest("หายใจติดขัด").some(({ word }) => word === "หายใจถี่แรง"));
});

test("bleeding, oozing, and bleeding stopping remain distinct states", () => {
  assert.ok(!thesaurus.suggest("เลือดออก").some(({ word }) => word === "เลือดซิบ"));
  assert.ok(!thesaurus.suggest("เลือดซึม").some(({ word }) => word === "เลือดหยุดไหล"));
  assert.ok(!thesaurus.suggest("เลือดหยุด").some(({ word }) => word === "โลหิตไหลออก"));
});

test("wound swelling and inflammation remain distinct", () => {
  assert.ok(!thesaurus.suggest("แผลบวม").some(({ word }) => word === "แผลแดงอักเสบ"));
  assert.ok(!thesaurus.suggest("แผลอักเสบ").some(({ word }) => word === "บาดแผลมีอาการบวม"));
});

test("pressing, washing, wiping, medicating, and bandaging a wound remain distinct", () => {
  assert.ok(!thesaurus.suggest("กดแผล").some(({ word }) => word === "ชำระล้างบาดแผล"));
  assert.ok(!thesaurus.suggest("ล้างแผล").some(({ word }) => word === "ซับบริเวณแผล"));
  assert.ok(!thesaurus.suggest("เช็ดแผล").some(({ word }) => word === "ใส่ยาที่แผล"));
  assert.ok(!thesaurus.suggest("ทายา").some(({ word }) => word === "พันผ้ารอบแผล"));
});

test("cold and warm compresses remain opposite temperatures", () => {
  assert.ok(!thesaurus.suggest("ประคบเย็น").some(({ word }) => word === "ใช้ของอุ่นประคบ"));
  assert.ok(!thesaurus.suggest("ประคบร้อน").some(({ word }) => word === "วางความเย็นบนบริเวณเจ็บ"));
});

test("taking medicine, swallowing a pill, and measuring temperature remain distinct", () => {
  assert.ok(!thesaurus.suggest("กินยา").some(({ word }) => word === "กลืนเม็ดยา"));
  assert.ok(!thesaurus.suggest("กลืนยา").some(({ word }) => word === "ตรวจอุณหภูมิร่างกาย"));
  assert.ok(!thesaurus.suggest("วัดไข้").some(({ word }) => word === "รับประทานยา"));
});

test("symptom and care entries preserve their intended POS", () => {
  for (const word of ["ไอ", "ไอแห้ง", "ไอเป็นเลือด", "จาม", "สูดจมูก", "น้ำมูกไหล", "ปวดศีรษะ", "ปวดท้อง", "ปวดแผล", "มีไข้", "ไข้ขึ้น", "หนาวสั่น", "เหงื่อออก", "เหงื่อแตก", "คลื่นไส้", "อาเจียน", "เวียนศีรษะ", "หน้ามืด", "เดินเซ", "เป็นลม", "ฟื้นจากเป็นลม", "หายใจหอบ", "หายใจติดขัด", "เลือดออก", "เลือดซึม", "เลือดหยุด", "แผลบวม", "แผลอักเสบ", "กดแผล", "ล้างแผล", "เช็ดแผล", "ใส่ยา", "ทายา", "พันแผล", "เปลี่ยนผ้าพันแผล", "ประคบเย็น", "ประคบร้อน", "กินยา", "กลืนยา", "วัดไข้", "พยุงคนเจ็บ", "เรียกหมอ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
  assert.ok(thesaurus.suggest("คัดจมูก").every(({ pos }) => pos.length === 1 && pos.includes("ว.")));
  assert.ok(thesaurus.suggest("เสียงแหบ").every(({ pos }) => pos.length === 1 && pos.includes("ว.")));
});

test("arriving, waiting, ringing, and requesting entry remain distinct arrival stages", () => {
  assert.ok(!thesaurus.suggest("มาถึงหน้าบ้าน").some(({ word }) => word === "ยืนคอยหน้าประตู"));
  assert.ok(!thesaurus.suggest("ยืนรอหน้าประตู").some(({ word }) => word === "กดออด"));
  assert.ok(!thesaurus.suggest("กดกริ่ง").some(({ word }) => word === "กล่าวขออนุญาตเข้าด้านใน"));
});

test("opening to receive, inviting in, and stepping inside remain host and guest stages", () => {
  assert.ok(!thesaurus.suggest("เปิดประตูรับ").some(({ word }) => word === "ชวนให้เข้าบ้าน"));
  assert.ok(!thesaurus.suggest("เชิญเข้าบ้าน").some(({ word }) => word === "ย่างเข้าสู่ตัวบ้าน"));
  assert.ok(!thesaurus.suggest("ก้าวเข้าบ้าน").some(({ word }) => word === "เปิดประตูต้อนรับ"));
});

test("removing and placing shoes outside remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถอดรองเท้าหน้าบ้าน").some(({ word }) => word === "จัดรองเท้าไว้นอกบ้าน"));
  assert.ok(!thesaurus.suggest("วางรองเท้าหน้าบ้าน").some(({ word }) => word === "ปลดรองเท้าก่อนเข้าบ้าน"));
});

test("giving and receiving a gift remain opposite roles", () => {
  assert.ok(!thesaurus.suggest("ยื่นของฝาก").some(({ word }) => word === "รับมอบของกำนัล"));
  assert.ok(!thesaurus.suggest("รับของฝาก").some(({ word }) => word === "ส่งของฝากให้"));
});

test("welcoming, introducing a guest, and stating one's own name remain distinct", () => {
  assert.ok(!thesaurus.suggest("กล่าวต้อนรับ").some(({ word }) => word === "กล่าวแนะนำผู้มาเยือน"));
  assert.ok(!thesaurus.suggest("แนะนำแขก").some(({ word }) => word === "แจ้งนามของตน"));
  assert.ok(!thesaurus.suggest("บอกชื่อตัวเอง").some(({ word }) => word === "พูดต้อนรับ"));
});

test("wai greeting, returning a wai, handshake, bow, and curtsy remain distinct greetings", () => {
  assert.ok(!thesaurus.suggest("ไหว้ทักทาย").some(({ word }) => word === "ประนมมือตอบรับการไหว้"));
  assert.ok(!thesaurus.suggest("รับไหว้").some(({ word }) => word === "สัมผัสมือเพื่อทักทาย"));
  assert.ok(!thesaurus.suggest("จับมือทักทาย").some(({ word }) => word === "น้อมกายคำนับ"));
  assert.ok(!thesaurus.suggest("ถอนสายบัว").some(({ word }) => word === "ก้มศีรษะเล็กน้อย"));
});

test("inviting someone to sit, offering a seat, and sitting with guests remain distinct", () => {
  assert.ok(!thesaurus.suggest("เชิญนั่ง").some(({ word }) => word === "มอบที่นั่งแก่ผู้มาเยือน"));
  assert.ok(!thesaurus.suggest("เสนอที่นั่ง").some(({ word }) => word === "นั่งพูดคุยกับแขก"));
  assert.ok(!thesaurus.suggest("นั่งรับแขก").some(({ word }) => word === "กล่าวเชื้อเชิญให้นั่ง"));
});

test("bringing, serving, accepting, and declining drinks remain distinct roles", () => {
  assert.ok(!thesaurus.suggest("ยกน้ำรับแขก").some(({ word }) => word === "รับมอบเครื่องดื่ม"));
  assert.ok(!thesaurus.suggest("เสิร์ฟน้ำ").some(({ word }) => word === "บอกว่าไม่รับน้ำ"));
  assert.ok(!thesaurus.suggest("รับเครื่องดื่ม").some(({ word }) => word === "นำเครื่องดื่มมาเสิร์ฟ"));
});

test("starting conversation, asking after welfare, polite talk, and changing topic remain distinct", () => {
  assert.ok(!thesaurus.suggest("ชวนคุย").some(({ word }) => word === "สอบถามทุกข์สุข"));
  assert.ok(!thesaurus.suggest("ถามสารทุกข์สุกดิบ").some(({ word }) => word === "พูดคุยตามธรรมเนียม"));
  assert.ok(!thesaurus.suggest("สนทนาตามมารยาท").some(({ word }) => word === "เบนบทสนทนา"));
});

test("requesting leave, standing to say goodbye, and waving remain distinct farewell stages", () => {
  assert.ok(!thesaurus.suggest("ขออนุญาตกลับ").some(({ word }) => word === "ลุกขึ้นบอกลา"));
  assert.ok(!thesaurus.suggest("ลุกกล่าวลา").some(({ word }) => word === "ยกมือโบกลา"));
  assert.ok(!thesaurus.suggest("โบกมือลา").some(({ word }) => word === "กล่าวขอจากไป"));
});

test("walking with a guest, reaching the door, and seeing a guest off remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินไปส่ง").some(({ word }) => word === "พาผู้มาเยือนถึงทางออก"));
  assert.ok(!thesaurus.suggest("ส่งถึงประตู").some(({ word }) => word === "ส่งผู้มาเยือนกลับ"));
  assert.ok(!thesaurus.suggest("ส่งแขก").some(({ word }) => word === "เดินตามไปส่ง"));
});

test("entering and leaving a house remain opposite", () => {
  assert.ok(!thesaurus.suggest("ก้าวเข้าบ้าน").some(({ word }) => word === "เดินออกจากบ้าน"));
  assert.ok(!thesaurus.suggest("ก้าวออกจากบ้าน").some(({ word }) => word === "ย่างเข้าสู่ตัวบ้าน"));
});

test("closing behind, watching departure, and waiting until out of sight remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปิดประตูตามหลัง").some(({ word }) => word === "ทอดสายตามองส่ง"));
  assert.ok(!thesaurus.suggest("มองส่ง").some(({ word }) => word === "ยืนรอจนพ้นสายตา"));
  assert.ok(!thesaurus.suggest("รอจนลับตา").some(({ word }) => word === "งับประตูตามหลัง"));
});

test("visit, hosting, and farewell entries preserve verb POS", () => {
  for (const word of ["มาถึงหน้าบ้าน", "ยืนรอหน้าประตู", "กดกริ่ง", "ขออนุญาตเข้า", "เปิดประตูรับ", "เชิญเข้าบ้าน", "ก้าวเข้าบ้าน", "ถอดรองเท้าหน้าบ้าน", "วางรองเท้าหน้าบ้าน", "ยื่นของฝาก", "รับของฝาก", "กล่าวต้อนรับ", "แนะนำแขก", "บอกชื่อตัวเอง", "ไหว้ทักทาย", "รับไหว้", "จับมือทักทาย", "โค้งคำนับ", "ถอนสายบัว", "ค้อมศีรษะ", "เชิญนั่ง", "เสนอที่นั่ง", "นั่งรับแขก", "ยกน้ำรับแขก", "เสิร์ฟน้ำ", "รับเครื่องดื่ม", "ปฏิเสธเครื่องดื่ม", "ชวนคุย", "ถามสารทุกข์สุกดิบ", "สนทนาตามมารยาท", "เปลี่ยนเรื่องคุย", "ขออนุญาตกลับ", "ลุกกล่าวลา", "โบกมือลา", "เดินไปส่ง", "ส่งถึงประตู", "ส่งแขก", "ก้าวออกจากบ้าน", "ปิดประตูตามหลัง", "มองส่ง", "รอจนลับตา"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("starting an argument, interrupting, interjecting, and arguing back remain distinct", () => {
  assert.ok(!thesaurus.suggest("เริ่มโต้เถียง").some(({ word }) => word === "แทรกกลางคำพูด"));
  assert.ok(!thesaurus.suggest("ขัดจังหวะ").some(({ word }) => word === "กล่าวแทรกระหว่างสนทนา"));
  assert.ok(!thesaurus.suggest("พูดแทรก").some(({ word }) => word === "สวนคำ"));
});

test("reasoned objection, raising voice, and shouting remain distinct escalation levels", () => {
  assert.ok(!thesaurus.suggest("โต้แย้งเหตุผล").some(({ word }) => word === "ยกระดับน้ำเสียง"));
  assert.ok(!thesaurus.suggest("ขึ้นเสียง").some(({ word }) => word === "ตะคอกใส่"));
  assert.ok(!thesaurus.suggest("ตวาดใส่").some(({ word }) => word === "แสดงเหตุผลโต้ตอบ"));
});

test("sarcasm, sniping, accusation, and blame remain distinct", () => {
  assert.ok(!thesaurus.suggest("พูดประชด").some(({ word }) => word === "แขวะ"));
  assert.ok(!thesaurus.suggest("เหน็บแนม").some(({ word }) => word === "ใส่ข้อกล่าวหา"));
  assert.ok(!thesaurus.suggest("กล่าวหา").some(({ word }) => word === "โยนความผิดให้"));
});

test("denying an allegation, making excuses, and clarifying remain distinct responses", () => {
  assert.ok(!thesaurus.suggest("ปฏิเสธข้อกล่าวหา").some(({ word }) => word === "หาข้อแก้ตัว"));
  assert.ok(!thesaurus.suggest("แก้ตัว").some(({ word }) => word === "แถลงข้อเท็จจริง"));
  assert.ok(!thesaurus.suggest("ชี้แจง").some(({ word }) => word === "บอกว่าไม่จริง"));
});

test("affirming and retracting words remain opposite", () => {
  assert.ok(!thesaurus.suggest("ยืนยันคำพูด").some(({ word }) => word === "ถอนถ้อยคำที่กล่าว"));
  assert.ok(!thesaurus.suggest("ถอนคำพูด").some(({ word }) => word === "ยืนกรานคำเดิม"));
});

test("challenging and threatening remain distinct", () => {
  assert.ok(!thesaurus.suggest("ท้าทาย").some(({ word }) => word === "กล่าวคำคุกคาม"));
  assert.ok(!thesaurus.suggest("ข่มขู่").some(({ word }) => word === "ท้าให้พิสูจน์"));
});

test("rejecting touch, turning away, walking away, and shutting a door remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปัดมือออก").some(({ word }) => word === "เบือนหน้าหนี"));
  assert.ok(!thesaurus.suggest("หันหนี").some(({ word }) => word === "เดินจากไป"));
  assert.ok(!thesaurus.suggest("เดินหนี").some(({ word }) => word === "กระแทกประตูปิด"));
});

test("calming oneself, lowering voice, and stopping argument remain distinct de-escalation", () => {
  assert.ok(!thesaurus.suggest("สงบสติอารมณ์").some(({ word }) => word === "พูดเบาลง"));
  assert.ok(!thesaurus.suggest("ลดเสียง").some(({ word }) => word === "ยุติการโต้เถียง"));
  assert.ok(!thesaurus.suggest("หยุดเถียง").some(({ word }) => word === "ควบคุมตนให้สงบ"));
});

test("listening, open talk, and explaining reasons remain distinct", () => {
  assert.ok(!thesaurus.suggest("ยอมฟัง").some(({ word }) => word === "สนทนาอย่างเปิดเผย"));
  assert.ok(!thesaurus.suggest("เปิดใจคุย").some(({ word }) => word === "แจกแจงเหตุผล"));
  assert.ok(!thesaurus.suggest("อธิบายเหตุผล").some(({ word }) => word === "เปิดโอกาสให้อีกฝ่ายพูด"));
});

test("asking for calm and asking for time remain distinct requests", () => {
  assert.ok(!thesaurus.suggest("ขอให้ใจเย็น").some(({ word }) => word === "ขอเวลาพิจารณา"));
  assert.ok(!thesaurus.suggest("ขอเวลาคิด").some(({ word }) => word === "ขอให้สงบลง"));
});

test("admitting fault, apologizing, and asking forgiveness remain distinct", () => {
  assert.ok(!thesaurus.suggest("ยอมรับผิด").some(({ word }) => word === "กล่าวขออภัย"));
  assert.ok(!thesaurus.suggest("กล่าวขอโทษ").some(({ word }) => word === "วิงวอนขออภัย"));
  assert.ok(!thesaurus.suggest("ขอให้ยกโทษ").some(({ word }) => word === "ยอมรับความผิด"));
});

test("accepting an apology and granting forgiveness remain distinct", () => {
  assert.ok(!thesaurus.suggest("รับคำขอโทษ").some(({ word }) => word === "อภัยให้"));
  assert.ok(!thesaurus.suggest("ยกโทษให้").some(({ word }) => word === "ยอมรับการขอโทษ"));
});

test("clearing misunderstanding, reaching agreement, and compromising remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปรับความเข้าใจ").some(({ word }) => word === "บรรลุข้อตกลง"));
  assert.ok(!thesaurus.suggest("ตกลงกัน").some(({ word }) => word === "พบกันครึ่งทาง"));
  assert.ok(!thesaurus.suggest("ประนีประนอม").some(({ word }) => word === "คลี่คลายความเข้าใจผิด"));
});

test("offering a hand, shaking hands, and hugging in reconciliation remain distinct gestures", () => {
  assert.ok(!thesaurus.suggest("ยื่นมือคืนดี").some(({ word }) => word === "จับมือปรองดอง"));
  assert.ok(!thesaurus.suggest("จับมือคืนดี").some(({ word }) => word === "กอดกันคืนดี"));
  assert.ok(!thesaurus.suggest("กอดคืนดี").some(({ word }) => word === "ยื่นมือขอคืนดี"));
});

test("resuming communication and ending conflict remain distinct", () => {
  assert.ok(!thesaurus.suggest("กลับมาพูดกัน").some(({ word }) => word === "ระงับความขัดแย้ง"));
  assert.ok(!thesaurus.suggest("ยุติข้อขัดแย้ง").some(({ word }) => word === "กลับมาคุยกัน"));
});

test("conflict and reconciliation entries preserve verb POS", () => {
  for (const word of ["เริ่มโต้เถียง", "ขัดจังหวะ", "พูดแทรก", "เถียงกลับ", "โต้แย้งเหตุผล", "ขึ้นเสียง", "ตวาดใส่", "พูดประชด", "เหน็บแนม", "กล่าวหา", "โทษอีกฝ่าย", "ปฏิเสธข้อกล่าวหา", "แก้ตัว", "ชี้แจง", "ยืนยันคำพูด", "ถอนคำพูด", "ท้าทาย", "ข่มขู่", "ปัดมือออก", "หันหนี", "เดินหนี", "ปิดประตูใส่", "สงบสติอารมณ์", "ลดเสียง", "หยุดเถียง", "ยอมฟัง", "เปิดใจคุย", "อธิบายเหตุผล", "ขอให้ใจเย็น", "ขอเวลาคิด", "ยอมรับผิด", "กล่าวขอโทษ", "ขอให้ยกโทษ", "รับคำขอโทษ", "ยกโทษให้", "ปรับความเข้าใจ", "ตกลงกัน", "ประนีประนอม", "ยื่นมือคืนดี", "จับมือคืนดี", "กอดคืนดี", "กลับมาพูดกัน", "ยุติข้อขัดแย้ง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("suspecting a person and raising a general question remain distinct", () => {
  assert.ok(!thesaurus.suggest("สงสัยบุคคล").some(({ word }) => word === "แสดงข้อสงสัย"));
  assert.ok(!thesaurus.suggest("ตั้งข้อสงสัย").some(({ word }) => word === "ระแวงบุคคล"));
});

test("investigating a matter, a background, data, and evidence remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("สืบเรื่อง").some(({ word }) => word === "ตรวจสอบประวัติบุคคล"));
  assert.ok(!thesaurus.suggest("สืบประวัติ").some(({ word }) => word === "สืบค้นข้อมูล"));
  assert.ok(!thesaurus.suggest("ค้นข้อมูล").some(({ word }) => word === "แสวงหาพยานหลักฐาน"));
});

test("checking documents, a scene, and traces remain distinct targets", () => {
  assert.ok(!thesaurus.suggest("ตรวจเอกสาร").some(({ word }) => word === "สำรวจจุดเกิดเหตุ"));
  assert.ok(!thesaurus.suggest("ตรวจที่เกิดเหตุ").some(({ word }) => word === "ตรวจหาร่องรอย"));
  assert.ok(!thesaurus.suggest("ตรวจร่องรอย").some(({ word }) => word === "พิจารณาเอกสาร"));
});

test("collecting, cataloging, and photographing evidence remain distinct", () => {
  assert.ok(!thesaurus.suggest("เก็บหลักฐาน").some(({ word }) => word === "บันทึกรายการพยานหลักฐาน"));
  assert.ok(!thesaurus.suggest("บันทึกหลักฐาน").some(({ word }) => word === "ถ่ายภาพหลักฐาน"));
  assert.ok(!thesaurus.suggest("ถ่ายรูปหลักฐาน").some(({ word }) => word === "รวบรวมหลักฐาน"));
});

test("comparing data, connecting clues, hypothesizing, and testing remain distinct reasoning stages", () => {
  assert.ok(!thesaurus.suggest("เปรียบเทียบข้อมูล").some(({ word }) => word === "ปะติดปะต่อเบาะแส"));
  assert.ok(!thesaurus.suggest("เชื่อมโยงเบาะแส").some(({ word }) => word === "กำหนดสมมติฐาน"));
  assert.ok(!thesaurus.suggest("ตั้งสมมติฐาน").some(({ word }) => word === "พิสูจน์สมมติฐาน"));
});

test("questioning witnesses, recording, and checking testimony remain distinct", () => {
  assert.ok(!thesaurus.suggest("สอบถามพยาน").some(({ word }) => word === "บันทึกคำให้การ"));
  assert.ok(!thesaurus.suggest("จดคำให้การ").some(({ word }) => word === "ตรวจสอบถ้อยคำพยาน"));
  assert.ok(!thesaurus.suggest("ตรวจคำให้การ").some(({ word }) => word === "ถามพยาน"));
});

test("noticing suspicion and actively finding inconsistency remain distinct", () => {
  assert.ok(!thesaurus.suggest("พบพิรุธ").some(({ word }) => word === "จับข้อผิดพลาด"));
  assert.ok(!thesaurus.suggest("จับผิด").some(({ word }) => word === "สังเกตพบข้อพิรุธ"));
});

test("watching, guarding, peeking, and observing from concealment remain distinct", () => {
  assert.ok(!thesaurus.suggest("เฝ้าดู").some(({ word }) => word === "คอยระวัง"));
  assert.ok(!thesaurus.suggest("เฝ้าระวัง").some(({ word }) => word === "แอบมอง"));
  assert.ok(!thesaurus.suggest("แอบดู").some(({ word }) => word === "ดักซุ่มดู"));
});

test("tailing, ordinary following, and following at a distance remain distinct", () => {
  assert.ok(!thesaurus.suggest("สะกดรอย").some(({ word }) => word === "เดินตามหลัง"));
  assert.ok(!thesaurus.suggest("เดินตาม").some(({ word }) => word === "เว้นระยะติดตาม"));
  assert.ok(!thesaurus.suggest("ตามห่างๆ").some(({ word }) => word === "ติดตามอย่างลับๆ"));
});

test("hiding, disguising appearance, using an alias, and concealing identity remain distinct", () => {
  assert.ok(!thesaurus.suggest("หลบซ่อน").some(({ word }) => word === "อำพรางรูปลักษณ์"));
  assert.ok(!thesaurus.suggest("ปลอมตัว").some(({ word }) => word === "ใช้นามแฝง"));
  assert.ok(!thesaurus.suggest("ใช้ชื่อปลอม").some(({ word }) => word === "ซ่อนตัวตน"));
});

test("concealing truth and keeping a secret remain distinct scope", () => {
  assert.ok(!thesaurus.suggest("ปกปิดความจริง").some(({ word }) => word === "รักษาเรื่องไว้ไม่เปิดเผย"));
  assert.ok(!thesaurus.suggest("เก็บเป็นความลับ").some(({ word }) => word === "ซ่อนความจริง"));
});

test("whispering information and sending a secret signal remain distinct channels", () => {
  assert.ok(!thesaurus.suggest("กระซิบบอก").some(({ word }) => word === "ส่งสัญญาณนัดหมาย"));
  assert.ok(!thesaurus.suggest("ส่งสัญญาณลับ").some(({ word }) => word === "กระซิบถ้อยคำ"));
});

test("encoding and decoding text remain opposite", () => {
  assert.ok(!thesaurus.suggest("เข้ารหัสข้อความ").some(({ word }) => word === "แปลงรหัสกลับเป็นข้อความ"));
  assert.ok(!thesaurus.suggest("ถอดรหัสข้อความ").some(({ word }) => word === "ทำให้ข้อความอ่านไม่ได้โดยตรง"));
});

test("revealing a secret and exposing truth remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดเผยความลับ").some(({ word }) => word === "เปิดเผยข้อเท็จจริง"));
  assert.ok(!thesaurus.suggest("เปิดโปงความจริง").some(({ word }) => word === "บอกความลับออกไป"));
});

test("destroying evidence, erasing tracks, and leaving tracks remain distinct and opposite", () => {
  assert.ok(!thesaurus.suggest("ทำลายหลักฐาน").some(({ word }) => word === "เหลือร่องรอย"));
  assert.ok(!thesaurus.suggest("ลบร่องรอย").some(({ word }) => word === "ทิ้งหลักฐานให้ตามพบ"));
  assert.ok(!thesaurus.suggest("ทิ้งร่องรอย").some(({ word }) => word === "กำจัดหลักฐาน"));
});

test("investigation, secrecy, and surveillance entries preserve verb POS", () => {
  for (const word of ["สงสัยบุคคล", "ตั้งข้อสงสัย", "สืบเรื่อง", "สืบประวัติ", "ค้นข้อมูล", "ค้นหาหลักฐาน", "ตรวจเอกสาร", "ตรวจที่เกิดเหตุ", "ตรวจร่องรอย", "เก็บหลักฐาน", "บันทึกหลักฐาน", "ถ่ายรูปหลักฐาน", "เปรียบเทียบข้อมูล", "เชื่อมโยงเบาะแส", "ตั้งสมมติฐาน", "ทดสอบข้อสันนิษฐาน", "สอบถามพยาน", "จดคำให้การ", "ตรวจคำให้การ", "พบพิรุธ", "จับผิด", "เฝ้าดู", "เฝ้าระวัง", "แอบดู", "ซุ่มดู", "สะกดรอย", "เดินตาม", "ตามห่างๆ", "หลบซ่อน", "ซ่อนตัว", "ปลอมตัว", "ใช้ชื่อปลอม", "ปิดบังตัวตน", "ปกปิดความจริง", "เก็บเป็นความลับ", "กระซิบบอก", "ส่งสัญญาณลับ", "เข้ารหัสข้อความ", "ถอดรหัสข้อความ", "เปิดเผยความลับ", "เปิดโปงความจริง", "ทำลายหลักฐาน", "ลบร่องรอย", "ทิ้งร่องรอย"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("setting out, entering forest, and leaving forest remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("ออกเดินป่า").some(({ word }) => word === "ก้าวเข้าสู่ป่า"));
  assert.ok(!thesaurus.suggest("เดินเข้าป่า").some(({ word }) => word === "ออกจากพื้นที่ป่า"));
  assert.ok(!thesaurus.suggest("เดินออกจากป่า").some(({ word }) => word === "เริ่มเดินป่า"));
});

test("following a path and leaving a path remain opposite", () => {
  assert.ok(!thesaurus.suggest("เดินตามทาง").some(({ word }) => word === "ออกนอกทางเดิน"));
  assert.ok(!thesaurus.suggest("เดินนอกเส้นทาง").some(({ word }) => word === "เคลื่อนที่ตามทางกำหนด"));
});

test("walking uphill and downhill remain opposite", () => {
  assert.ok(!thesaurus.suggest("เดินขึ้นเขา").some(({ word }) => word === "ลดระดับลงจากภูเขา"));
  assert.ok(!thesaurus.suggest("เดินลงเขา").some(({ word }) => word === "ไต่ระดับขึ้นภูเขา"));
  assert.ok(!thesaurus.suggest("ไต่ทางลาด").some(({ word }) => word === "เคลื่อนลงตามทางลาด"));
});

test("climbing a cliff, rappelling, and holding a rope remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปีนหน้าผา").some(({ word }) => word === "ลดตัวลงด้วยเชือก"));
  assert.ok(!thesaurus.suggest("โรยตัวลง").some(({ word }) => word === "จับเชือกไว้"));
  assert.ok(!thesaurus.suggest("เกาะเชือก").some(({ word }) => word === "ไต่หน้าผา"));
});

test("climbing and descending a tree remain opposite", () => {
  assert.ok(!thesaurus.suggest("ปีนต้นไม้").some(({ word }) => word === "ไต่ลงจากต้นไม้"));
  assert.ok(!thesaurus.suggest("ลงจากต้นไม้").some(({ word }) => word === "ปีนขึ้นตามลำต้น"));
});

test("crossing a bridge, crossing a stream, wading, and walking beside water remain distinct", () => {
  assert.ok(!thesaurus.suggest("ข้ามสะพาน").some(({ word }) => word === "เดินข้ามธารน้ำ"));
  assert.ok(!thesaurus.suggest("ข้ามลำธาร").some(({ word }) => word === "เดินฝ่าน้ำ"));
  assert.ok(!thesaurus.suggest("ลุยน้ำ").some(({ word }) => word === "เดินเลียบฝั่งน้ำ"));
});

test("jumping a ditch, stepping over a log, and ducking under a branch remain distinct obstacles", () => {
  assert.ok(!thesaurus.suggest("กระโดดข้ามร่อง").some(({ word }) => word === "ยกเท้าข้ามท่อนไม้"));
  assert.ok(!thesaurus.suggest("ก้าวข้ามท่อนไม้").some(({ word }) => word === "ก้มลอดใต้กิ่งไม้"));
  assert.ok(!thesaurus.suggest("มุดใต้กิ่ง").some(({ word }) => word === "กระโจนข้ามร่อง"));
});

test("pushing through bushes and parting grass remain vegetation-specific", () => {
  assert.ok(!thesaurus.suggest("ฝ่าพุ่มไม้").some(({ word }) => word === "แยกกอหญ้าออก"));
  assert.ok(!thesaurus.suggest("แหวกหญ้า").some(({ word }) => word === "เคลื่อนผ่านแนวพุ่มไม้"));
});

test("walking on rocks, stepping in mud, slipping, and balancing remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินบนโขดหิน").some(({ word }) => word === "ย่ำลงในโคลน"));
  assert.ok(!thesaurus.suggest("เหยียบโคลน").some(({ word }) => word === "เสียหลักลื่นไป"));
  assert.ok(!thesaurus.suggest("ลื่นไถล").some(({ word }) => word === "รักษาสมดุลบนทางแคบ"));
});

test("general rest and roadside rest remain distinct scope", () => {
  assert.ok(!thesaurus.suggest("หยุดพัก").some(({ word }) => word === "นั่งพักข้างทาง"));
  assert.ok(!thesaurus.suggest("พักริมทาง").some(({ word }) => word === "หยุดเพื่อพักแรง"));
});

test("opening a map, checking a compass, and finding direction remain distinct", () => {
  assert.ok(!thesaurus.suggest("กางแผนที่").some(({ word }) => word === "ตรวจเข็มทิศ"));
  assert.ok(!thesaurus.suggest("ดูเข็มทิศ").some(({ word }) => word === "กำหนดทิศทางการเดินทาง"));
  assert.ok(!thesaurus.suggest("หาทิศทาง").some(({ word }) => word === "คลี่แผนที่"));
});

test("getting lost and retracing the route remain distinct", () => {
  assert.ok(!thesaurus.suggest("หลงเส้นทาง").some(({ word }) => word === "เดินกลับทางเก่า"));
  assert.ok(!thesaurus.suggest("ย้อนกลับทางเดิม").some(({ word }) => word === "ออกนอกเส้นทางที่ควรไป"));
});

test("selecting camp, pitching tent, staking tent, and making fire remain distinct", () => {
  assert.ok(!thesaurus.suggest("เลือกที่ตั้งค่าย").some(({ word }) => word === "ตั้งเต็นท์"));
  assert.ok(!thesaurus.suggest("กางเต็นท์").some(({ word }) => word === "ตอกหลักเต็นท์"));
  assert.ok(!thesaurus.suggest("ตอกสมอบก").some(({ word }) => word === "จุดกองไฟ"));
});

test("lighting and extinguishing a campfire remain opposite", () => {
  assert.ok(!thesaurus.suggest("ก่อกองไฟ").some(({ word }) => word === "ดับไฟค่าย"));
  assert.ok(!thesaurus.suggest("ดับกองไฟ").some(({ word }) => word === "ก่อไฟสำหรับพักแรม"));
});

test("pitching, packing, and leaving camp remain distinct", () => {
  assert.ok(!thesaurus.suggest("กางเต็นท์").some(({ word }) => word === "พับเต็นท์"));
  assert.ok(!thesaurus.suggest("เก็บเต็นท์").some(({ word }) => word === "เดินออกจากค่าย"));
  assert.ok(!thesaurus.suggest("ออกจากค่าย").some(({ word }) => word === "ประกอบที่พักแบบเต็นท์"));
});

test("terrain travel and camping entries preserve verb POS", () => {
  for (const word of ["ออกเดินป่า", "เดินเข้าป่า", "เดินออกจากป่า", "เดินตามทาง", "เดินนอกเส้นทาง", "เดินขึ้นเขา", "เดินลงเขา", "ไต่ทางลาด", "ลงทางลาด", "ปีนหน้าผา", "โรยตัวลง", "เกาะเชือก", "ปีนต้นไม้", "ลงจากต้นไม้", "ข้ามสะพาน", "ข้ามลำธาร", "ลุยน้ำ", "เดินริมน้ำ", "กระโดดข้ามร่อง", "ก้าวข้ามท่อนไม้", "มุดใต้กิ่ง", "ฝ่าพุ่มไม้", "แหวกหญ้า", "เดินบนโขดหิน", "เหยียบโคลน", "ลื่นไถล", "ทรงตัวบนทางแคบ", "หยุดพัก", "พักริมทาง", "กางแผนที่", "ดูเข็มทิศ", "หาทิศทาง", "หลงเส้นทาง", "ย้อนกลับทางเดิม", "หาแหล่งน้ำ", "เลือกที่ตั้งค่าย", "กางเต็นท์", "ตอกสมอบก", "ก่อกองไฟ", "ดับกองไฟ", "เก็บเต็นท์", "ออกจากค่าย"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("facing, taking stance, drawing, and sheathing a sword remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("เผชิญหน้า").some(({ word }) => word === "ตั้งท่าสู้"));
  assert.ok(!thesaurus.suggest("ตั้งท่าต่อสู้").some(({ word }) => word === "ดึงดาบออกจากฝัก"));
  assert.ok(!thesaurus.suggest("ชักดาบ").some(({ word }) => word === "สอดดาบเข้าฝัก"));
});

test("gripping, lowering a weapon, raising shield, and guarding remain distinct", () => {
  assert.ok(!thesaurus.suggest("กำอาวุธ").some(({ word }) => word === "ลดปลายอาวุธ"));
  assert.ok(!thesaurus.suggest("ลดอาวุธ").some(({ word }) => word === "ยกโล่ขึ้น"));
  assert.ok(!thesaurus.suggest("ตั้งการ์ด").some(({ word }) => word === "กระชับอาวุธในมือ"));
});

test("closing distance, maintaining distance, retreating, and charging remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้าประชิด").some(({ word }) => word === "คงระยะห่าง"));
  assert.ok(!thesaurus.suggest("รักษาระยะ").some(({ word }) => word === "ถอยไปตั้งตัว"));
  assert.ok(!thesaurus.suggest("ถอยตั้งหลัก").some(({ word }) => word === "โถมเข้าใส่"));
});

test("hooking punch, straight punch, and sweeping kick remain distinct attacks", () => {
  assert.ok(!thesaurus.suggest("เหวี่ยงหมัด").some(({ word }) => word === "ปล่อยหมัดตรง"));
  assert.ok(!thesaurus.suggest("ชกตรง").some(({ word }) => word === "กวาดขา"));
  assert.ok(!thesaurus.suggest("เตะกวาด").some(({ word }) => word === "ปล่อยหมัดเหวี่ยง"));
});

test("sword slash and sword thrust remain distinct attack directions", () => {
  assert.ok(!thesaurus.suggest("ฟันดาบ").some(({ word }) => word === "ใช้ปลายดาบโจมตี"));
  assert.ok(!thesaurus.suggest("แทงดาบ").some(({ word }) => word === "เหวี่ยงดาบฟัน"));
});

test("stringing, drawing, aiming, releasing, and shooting a bow remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("ขึ้นสายธนู").some(({ word }) => word === "ดึงสายธนู"));
  assert.ok(!thesaurus.suggest("ง้างธนู").some(({ word }) => word === "กะเป้า"));
  assert.ok(!thesaurus.suggest("เล็งเป้า").some(({ word }) => word === "ปล่อยสายยิง"));
  assert.ok(!thesaurus.suggest("ยิงธนู").some(({ word }) => word === "ติดตั้งสายบนคันธนู"));
});

test("punch dodge, duck, jump dodge, and roll dodge remain distinct motions", () => {
  assert.ok(!thesaurus.suggest("หลบหมัด").some(({ word }) => word === "ย่อตัวหลบ"));
  assert.ok(!thesaurus.suggest("ก้มหลบ").some(({ word }) => word === "กระโจนหลบ"));
  assert.ok(!thesaurus.suggest("กระโดดหลบ").some(({ word }) => word === "ม้วนตัวหลบ"));
});

test("deflecting a sword, parrying, shielding, and intercepting remain distinct defenses", () => {
  assert.ok(!thesaurus.suggest("ปัดดาบ").some(({ word }) => word === "ใช้อาวุธรับดาบ"));
  assert.ok(!thesaurus.suggest("รับคมดาบ").some(({ word }) => word === "ใช้โล่ป้องกัน"));
  assert.ok(!thesaurus.suggest("ยกโล่กัน").some(({ word }) => word === "ขวางการโจมตี"));
});

test("blocking and counterattacking remain defense and response stages", () => {
  assert.ok(!thesaurus.suggest("สกัดการโจมตี").some(({ word }) => word === "โต้กลับทันที"));
  assert.ok(!thesaurus.suggest("สวนกลับ").some(({ word }) => word === "หยุดการรุก"));
});

test("wrist grab, arm lock, and pushing remain distinct controls", () => {
  assert.ok(!thesaurus.suggest("จับข้อมือ").some(({ word }) => word === "บิดแขนล็อก"));
  assert.ok(!thesaurus.suggest("ล็อกแขน").some(({ word }) => word === "ดันอีกฝ่ายออก"));
  assert.ok(!thesaurus.suggest("ผลักคู่ต่อสู้").some(({ word }) => word === "ยึดข้อมือไว้"));
});

test("disarming and knocking a weapon loose remain distinct outcomes", () => {
  assert.ok(!thesaurus.suggest("ปลดอาวุธ").some(({ word }) => word === "ตีอาวุธให้หลุด"));
  assert.ok(!thesaurus.suggest("ทำอาวุธหลุดมือ").some(({ word }) => word === "ทำให้อีกฝ่ายไร้อาวุธ"));
});

test("knocking down and pinning remain distinct controls", () => {
  assert.ok(!thesaurus.suggest("ล้มคู่ต่อสู้").some(({ word }) => word === "กดอีกฝ่ายไว้"));
  assert.ok(!thesaurus.suggest("ตรึงคู่ต่อสู้").some(({ word }) => word === "โค่นคู่ต่อสู้ลง"));
});

test("stopping one's hand, lowering sword, and laying down weapons remain distinct", () => {
  assert.ok(!thesaurus.suggest("หยุดมือ").some(({ word }) => word === "ลดคมดาบ"));
  assert.ok(!thesaurus.suggest("ลดดาบ").some(({ word }) => word === "ทิ้งอาวุธ"));
  assert.ok(!thesaurus.suggest("วางอาวุธ").some(({ word }) => word === "ชะงักมือ"));
});

test("surrender gesture and withdrawing from combat remain distinct endings", () => {
  assert.ok(!thesaurus.suggest("ชูมือยอมแพ้").some(({ word }) => word === "ถอยออกจากการต่อสู้"));
  assert.ok(!thesaurus.suggest("ถอนตัวจากการต่อสู้").some(({ word }) => word === "ยกมือยอมจำนน"));
});

test("combat scene entries preserve verb POS", () => {
  for (const word of ["เผชิญหน้า", "ตั้งท่าต่อสู้", "ชักดาบ", "เก็บดาบ", "กำอาวุธ", "ลดอาวุธ", "ชูโล่", "ตั้งการ์ด", "เข้าประชิด", "รักษาระยะ", "ถอยตั้งหลัก", "พุ่งเข้าใส่", "เหวี่ยงหมัด", "ชกตรง", "เตะกวาด", "ฟันดาบ", "แทงดาบ", "ยิงธนู", "ขึ้นสายธนู", "ง้างธนู", "ปล่อยลูกธนู", "เล็งเป้า", "หลบหมัด", "ก้มหลบ", "กระโดดหลบ", "กลิ้งหลบ", "ปัดดาบ", "รับคมดาบ", "ยกโล่กัน", "สกัดการโจมตี", "สวนกลับ", "จับข้อมือ", "ล็อกแขน", "ผลักคู่ต่อสู้", "ปลดอาวุธ", "ทำอาวุธหลุดมือ", "ล้มคู่ต่อสู้", "ตรึงคู่ต่อสู้", "หยุดมือ", "ลดดาบ", "วางอาวุธ", "ชูมือยอมแพ้", "ถอนตัวจากการต่อสู้"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("chanting, casting, drawing a circle, writing, and engraving runes remain distinct", () => {
  assert.ok(!thesaurus.suggest("ท่องคาถา").some(({ word }) => word === "ปล่อยคาถา"));
  assert.ok(!thesaurus.suggest("ร่ายคาถา").some(({ word }) => word === "เขียนวงเวท"));
  assert.ok(!thesaurus.suggest("เขียนอักขระ").some(({ word }) => word === "สลักอักขระ"));
  assert.ok(!thesaurus.suggest("จารอักขระ").some(({ word }) => word === "บันทึกอักขระมนตรา"));
});

test("preparing, starting, ending, and completing a ritual remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("เตรียมพิธี").some(({ word }) => word === "เปิดพิธี"));
  assert.ok(!thesaurus.suggest("เริ่มพิธี").some(({ word }) => word === "ยุติการประกอบพิธีกรรม"));
  assert.ok(!thesaurus.suggest("พิธีเสร็จสิ้น").some(({ word }) => word === "จัดของทำพิธี"));
});

test("gathering, drawing, transferring, storing, and releasing power remain distinct", () => {
  assert.ok(!thesaurus.suggest("รวบรวมพลัง").some(({ word }) => word === "ชักนำพลังเข้าสู่ตน"));
  assert.ok(!thesaurus.suggest("ดึงพลัง").some(({ word }) => word === "ถ่ายโอนพลังอำนาจ"));
  assert.ok(!thesaurus.suggest("ถ่ายทอดพลัง").some(({ word }) => word === "สะสมพลังอำนาจ"));
  assert.ok(!thesaurus.suggest("กักเก็บพลัง").some(({ word }) => word === "ปล่อยพลังออก"));
});

test("controlling power and losing control remain opposite", () => {
  assert.ok(!thesaurus.suggest("ควบคุมพลัง").some(({ word }) => word === "คุมพลังไม่อยู่"));
  assert.ok(!thesaurus.suggest("พลังหลุดควบคุม").some(({ word }) => word === "กำกับพลังอำนาจ"));
});

test("creating flame, firing magic, radiating, and bursting power remain distinct", () => {
  assert.ok(!thesaurus.suggest("สร้างเปลวเวท").some(({ word }) => word === "ส่งกระแสมนตราโจมตี"));
  assert.ok(!thesaurus.suggest("ยิงพลังเวท").some(({ word }) => word === "แผ่รัศมีอำนาจ"));
  assert.ok(!thesaurus.suggest("แผ่พลัง").some(({ word }) => word === "ปล่อยพลังระเบิด"));
});

test("magic armor, barrier, strengthening, healing, and restoring power remain distinct", () => {
  assert.ok(!thesaurus.suggest("สร้างเกราะเวท").some(({ word }) => word === "สร้างแนวพลังป้องกัน"));
  assert.ok(!thesaurus.suggest("กางม่านพลัง").some(({ word }) => word === "ยกระดับพลังอำนาจ"));
  assert.ok(!thesaurus.suggest("เสริมพลัง").some(({ word }) => word === "เยียวยาด้วยมนตรา"));
  assert.ok(!thesaurus.suggest("รักษาด้วยเวท").some(({ word }) => word === "เติมพลังคืน"));
});

test("summoning a spirit and summoning a beast remain distinct entities", () => {
  assert.ok(!thesaurus.suggest("อัญเชิญวิญญาณ").some(({ word }) => word === "เรียกอสูรออกมา"));
  assert.ok(!thesaurus.suggest("เรียกสัตว์อสูร").some(({ word }) => word === "เชื้อเชิญดวงวิญญาณ"));
});

test("returning and banishing a spirit remain distinct outcomes", () => {
  assert.ok(!thesaurus.suggest("ส่งวิญญาณกลับ").some(({ word }) => word === "ไล่วิญญาณออก"));
  assert.ok(!thesaurus.suggest("ขับไล่วิญญาณ").some(({ word }) => word === "นำวิญญาณกลับสู่ภพเดิม"));
});

test("placing, removing a curse, and dispelling magic remain distinct", () => {
  assert.ok(!thesaurus.suggest("วางคำสาป").some(({ word }) => word === "แก้คำสาป"));
  assert.ok(!thesaurus.suggest("ถอนคำสาป").some(({ word }) => word === "สลายอำนาจเวท"));
  assert.ok(!thesaurus.suggest("คลายมนตร์").some(({ word }) => word === "ประทับอาถรรพ์"));
});

test("mind control and resisting it remain opposite", () => {
  assert.ok(!thesaurus.suggest("สะกดจิต").some(({ word }) => word === "ต่อต้านการครอบงำจิต"));
  assert.ok(!thesaurus.suggest("ต้านมนตร์สะกด").some(({ word }) => word === "ควบคุมจิต"));
});

test("sealing power, sealing a door, unsealing, and breaking a seal remain distinct", () => {
  assert.ok(!thesaurus.suggest("ผนึกพลัง").some(({ word }) => word === "ปิดผนึกทางเข้า"));
  assert.ok(!thesaurus.suggest("ผนึกประตู").some(({ word }) => word === "เปิดผนึก"));
  assert.ok(!thesaurus.suggest("ปลดผนึก").some(({ word }) => word === "พังตราผนึก"));
  assert.ok(!thesaurus.suggest("ทำลายผนึก").some(({ word }) => word === "กักพลังไว้"));
});

test("detecting, reading, hiding, and cloaking magic remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตรวจจับเวท").some(({ word }) => word === "วิเคราะห์การไหลของพลัง"));
  assert.ok(!thesaurus.suggest("อ่านกระแสพลัง").some(({ word }) => word === "ปกปิดกระแสมนตรา"));
  assert.ok(!thesaurus.suggest("ซ่อนพลังเวท").some(({ word }) => word === "บดบังการตรวจจับมนตรา"));
});

test("reflected magic, interrupted incantation, and failed spell remain distinct failures", () => {
  assert.ok(!thesaurus.suggest("เวทสะท้อนกลับ").some(({ word }) => word === "ร่ายคาถาสะดุด"));
  assert.ok(!thesaurus.suggest("คาถาขาดตอน").some(({ word }) => word === "มนตราไม่บังเกิดผล"));
  assert.ok(!thesaurus.suggest("เวทล้มเหลว").some(({ word }) => word === "มนตราหวนคืนสู่ผู้ร่าย"));
});

test("power dissipating and a magic circle breaking remain distinct failures", () => {
  assert.ok(!thesaurus.suggest("พลังสลาย").some(({ word }) => word === "วงเวทพัง"));
  assert.ok(!thesaurus.suggest("วงเวทแตก").some(({ word }) => word === "พลังอำนาจมลายไป"));
});

test("magic and ritual entries preserve verb POS", () => {
  for (const word of ["ท่องคาถา", "ร่ายคาถา", "วาดวงเวท", "เขียนอักขระ", "จารอักขระ", "เตรียมพิธี", "เริ่มพิธี", "จบพิธี", "รวบรวมพลัง", "ดึงพลัง", "ถ่ายทอดพลัง", "กักเก็บพลัง", "ปลดปล่อยพลัง", "ควบคุมพลัง", "พลังหลุดควบคุม", "สร้างเปลวเวท", "ยิงพลังเวท", "แผ่พลัง", "ระเบิดพลัง", "สร้างเกราะเวท", "กางม่านพลัง", "เสริมพลัง", "รักษาด้วยเวท", "ฟื้นฟูพลัง", "อัญเชิญวิญญาณ", "เรียกสัตว์อสูร", "ส่งวิญญาณกลับ", "ขับไล่วิญญาณ", "วางคำสาป", "ถอนคำสาป", "คลายมนตร์", "สะกดจิต", "ต้านมนตร์สะกด", "ผนึกพลัง", "ผนึกประตู", "ปลดผนึก", "ทำลายผนึก", "ตรวจจับเวท", "อ่านกระแสพลัง", "ซ่อนพลังเวท", "อำพรางเวท", "เวทสะท้อนกลับ", "คาถาขาดตอน", "เวทล้มเหลว", "พลังสลาย", "วงเวทแตก", "พิธีเสร็จสิ้น"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("court arrival, waiting, requesting, and audience remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("เดินเข้าท้องพระโรง").some(({ word }) => word === "คอยรับพระราชทานพระบรมราชวโรกาส"));
  assert.ok(!thesaurus.suggest("รอเข้าเฝ้า").some(({ word }) => word === "ขอพระราชทานพระบรมราชวโรกาสเข้าเฝ้า"));
  assert.ok(!thesaurus.suggest("ขอเข้าเฝ้า").some(({ word }) => word === "เข้าเฝ้าทูลละอองธุลีพระบาท"));
});

test("court gestures remain distinct", () => {
  assert.ok(!thesaurus.suggest("หมอบกราบ").some(({ word }) => word === "กราบถวายบังคม"));
  assert.ok(!thesaurus.suggest("ถวายบังคม").some(({ word }) => word === "คุกเข่าลงเบื้องหน้า"));
  assert.ok(!thesaurus.suggest("คุกเข่าต่อหน้า").some(({ word }) => word === "น้อมศีรษะรับพระบัญชา"));
});

test("royal reports, questions, answers, objections, requests, invitations, and leave remain distinct", () => {
  for (const [source, excluded] of [["ทูลรายงาน", "กราบบังคมทูลถาม"], ["ทูลถาม", "กราบบังคมทูลตอบ"], ["ทูลคัดค้าน", "กราบบังคมทูลขอพระกรุณา"], ["ทูลเชิญ", "กราบบังคมทูลลา"]]) {
    assert.ok(!thesaurus.suggest(source).some(({ word }) => word === excluded), source);
  }
});

test("offering reports, documents, and objects remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถวายรายงาน").some(({ word }) => word === "ทูลเกล้าทูลกระหม่อมถวายเอกสาร"));
  assert.ok(!thesaurus.suggest("ถวายเอกสาร").some(({ word }) => word === "ทูลเกล้าทูลกระหม่อมถวายสิ่งของ"));
});

test("receiving a royal grant, order, and speech remain distinct", () => {
  assert.ok(!thesaurus.suggest("รับพระราชทาน").some(({ word }) => word === "รับสนองพระบรมราชโองการ"));
  assert.ok(!thesaurus.suggest("รับพระบรมราชโองการ").some(({ word }) => word === "รับฟังพระราชดำรัส"));
});

test("royal speech, thought, and listening remain distinct", () => {
  assert.ok(!thesaurus.suggest("มีพระราชดำรัส").some(({ word }) => word === "ทรงพระดำริ"));
  assert.ok(!thesaurus.suggest("มีพระราชดำริ").some(({ word }) => word === "ทรงสดับ"));
});

test("royal permission, refusal, award, and pardon remain distinct", () => {
  assert.ok(!thesaurus.suggest("ทรงอนุญาต").some(({ word }) => word === "มิได้พระราชทานพระบรมราชานุญาต"));
  assert.ok(!thesaurus.suggest("พระราชทานรางวัล").some(({ word }) => word === "พระราชทานอภัยโทษ"));
});

test("royal entrance, exit, ascending, and descending remain distinct", () => {
  assert.ok(!thesaurus.suggest("เสด็จเข้าสู่ท้องพระโรง").some(({ word }) => word === "เสด็จพระราชดำเนินพ้นท้องพระโรง"));
  assert.ok(!thesaurus.suggest("เสด็จขึ้นประทับ").some(({ word }) => word === "เสด็จพระราชดำเนินลงจากที่ประทับ"));
});

test("subject withdrawal, hall exit, and seeing off remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถอยออกจากที่ประทับ").some(({ word }) => word === "เดินพ้นท้องพระโรง"));
  assert.ok(!thesaurus.suggest("ออกจากท้องพระโรง").some(({ word }) => word === "ถวายการส่งเสด็จ"));
});

test("court and royal alternatives retain their intended registers", () => {
  assert.equal(thesaurus.suggest("เข้าเฝ้า").find(({ word }) => word === "เข้าเฝ้าทูลละอองธุลีพระบาท")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("ทรงอนุญาต").find(({ word }) => word === "พระราชทานพระบรมราชานุญาต")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("เสด็จเข้าสู่ท้องพระโรง").find(({ word }) => word === "เสด็จพระราชดำเนินเข้าท้องพระโรง")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("ออกจากท้องพระโรง").find(({ word }) => word === "ถอนตัวออกจากพระราชฐาน")?.register, "ทางการ");
});

test("court and royal entries preserve verb POS", () => {
  for (const word of ["เดินเข้าท้องพระโรง", "รอเข้าเฝ้า", "ขอเข้าเฝ้า", "ได้รับอนุญาตเข้าเฝ้า", "เข้าเฝ้า", "หมอบกราบ", "ถวายบังคม", "คุกเข่าต่อหน้า", "ก้มศีรษะรับคำ", "ยืนสำรวม", "กราบบังคมทูล", "ทูลรายงาน", "ทูลถาม", "ทูลตอบ", "ทูลคัดค้าน", "ทูลขอ", "ทูลเชิญ", "ทูลลา", "ถวายรายงาน", "ถวายเอกสาร", "ถวายของ", "ถวายพระพร", "รับพระราชทาน", "รับพระบรมราชโองการ", "น้อมรับพระราชดำรัส", "ประกาศพระบรมราชโองการ", "มีพระราชดำรัส", "มีพระราชดำริ", "ทรงรับฟัง", "ทรงอนุญาต", "ทรงปฏิเสธ", "ทรงพระกรุณา", "พระราชทานรางวัล", "พระราชทานอภัย", "เสด็จเข้าสู่ท้องพระโรง", "เสด็จออกจากท้องพระโรง", "เสด็จขึ้นประทับ", "เสด็จลงจากพระที่นั่ง", "ถอยออกจากที่ประทับ", "ออกจากท้องพระโรง", "ส่งเสด็จ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("calling, opening, joining, and closing a meeting remain distinct stages", () => {
  assert.ok(!thesaurus.suggest("เรียกประชุม").some(({ word }) => word === "กล่าวเปิดที่ประชุม"));
  assert.ok(!thesaurus.suggest("เปิดประชุม").some(({ word }) => word === "เข้าร่วมการหารือ"));
  assert.ok(!thesaurus.suggest("เข้าประชุม").some(({ word }) => word === "ยุติการประชุม"));
});

test("agenda, clarification, report, and opinion remain distinct meeting actions", () => {
  assert.ok(!thesaurus.suggest("เสนอวาระ").some(({ word }) => word === "แถลงข้อเท็จจริงต่อที่ประชุม"));
  assert.ok(!thesaurus.suggest("ชี้แจงต่อที่ประชุม").some(({ word }) => word === "เสนอรายงานต่อที่ประชุม"));
  assert.ok(!thesaurus.suggest("ขอความเห็น").some(({ word }) => word === "เสนอข้อคิดเห็น"));
});

test("discussion, objection, voting, resolution, and ratification remain distinct", () => {
  assert.ok(!thesaurus.suggest("อภิปราย").some(({ word }) => word === "เสนอข้อโต้แย้ง"));
  assert.ok(!thesaurus.suggest("ลงมติ").some(({ word }) => word === "มีข้อยุติของที่ประชุม"));
  assert.ok(!thesaurus.suggest("มีมติ").some(({ word }) => word === "ให้ความเห็นชอบแก่มติ"));
});

test("pausing, postponing, and closing a meeting remain distinct", () => {
  assert.ok(!thesaurus.suggest("พักการประชุม").some(({ word }) => word === "เปลี่ยนกำหนดการประชุม"));
  assert.ok(!thesaurus.suggest("เลื่อนการประชุม").some(({ word }) => word === "กล่าวปิดที่ประชุม"));
});

test("issuing, receiving, following, relaying, revoking, and defying orders remain distinct", () => {
  assert.ok(!thesaurus.suggest("ออกคำสั่ง").some(({ word }) => word === "รับข้อสั่งการ"));
  assert.ok(!thesaurus.suggest("ปฏิบัติตามคำสั่ง").some(({ word }) => word === "แจ้งข้อสั่งการแก่ผู้เกี่ยวข้อง"));
  assert.ok(!thesaurus.suggest("เพิกถอนคำสั่ง").some(({ word }) => word === "ไม่ปฏิบัติตามคำสั่ง"));
});

test("royal order issuance, reception, execution, relay, and defiance remain distinct", () => {
  assert.ok(!thesaurus.suggest("มีพระบรมราชโองการ").some(({ word }) => word === "น้อมรับพระราชบัญชา"));
  assert.ok(!thesaurus.suggest("รับพระราชบัญชา").some(({ word }) => word === "น้อมนำพระราชบัญชาไปปฏิบัติ"));
  assert.ok(!thesaurus.suggest("ถ่ายทอดพระราชบัญชา").some(({ word }) => word === "ไม่ปฏิบัติตามพระราชบัญชา"));
});

test("ordinary orders and royal commands preserve register boundaries", () => {
  assert.equal(thesaurus.suggest("ออกคำสั่ง").find(({ word }) => word === "มีคำสั่ง")?.register, "ทางการ");
  assert.equal(thesaurus.suggest("มีพระบรมราชโองการ").find(({ word }) => word === "ทรงมีพระบรมราชโองการ")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("รับพระราชบัญชา").find(({ word }) => word === "รับสนองพระราชบัญชา")?.register, "ราชาศัพท์");
});

test("royal consultation, drafting, signature, and administration remain distinct", () => {
  assert.ok(!thesaurus.suggest("ถวายคำปรึกษา").some(({ word }) => word === "ทูลเกล้าทูลกระหม่อมถวายร่างพระราชโองการ"));
  assert.ok(!thesaurus.suggest("ถวายร่างพระราชโองการ").some(({ word }) => word === "ทรงลงพระปรมาภิไธย"));
  assert.ok(!thesaurus.suggest("ลงพระปรมาภิไธย").some(({ word }) => word === "เสด็จออกว่าราชการ"));
});

test("meeting, command, and royal administration entries preserve verb POS", () => {
  for (const word of ["เรียกประชุม", "เรียกประชุมขุนนาง", "เปิดประชุม", "เข้าประชุม", "ประชุมหารือ", "เสนอวาระ", "แจ้งวาระ", "ชี้แจงต่อที่ประชุม", "รายงานต่อที่ประชุม", "ขอความเห็น", "แสดงความคิดเห็น", "ถวายคำปรึกษา", "อภิปราย", "โต้แย้งในที่ประชุม", "ลงมติ", "มีมติ", "รับรองมติ", "คัดค้านมติ", "พักการประชุม", "เลื่อนการประชุม", "ปิดประชุม", "ออกคำสั่ง", "รับคำสั่ง", "ปฏิบัติตามคำสั่ง", "ถ่ายทอดคำสั่ง", "เพิกถอนคำสั่ง", "ฝ่าฝืนคำสั่ง", "มีพระบรมราชโองการ", "มีพระราชกระแสรับสั่ง", "รับพระราชบัญชา", "ปฏิบัติตามพระราชบัญชา", "ถ่ายทอดพระราชบัญชา", "ประกาศพระราชบัญชา", "ฝ่าฝืนพระราชบัญชา", "ถวายร่างพระราชโองการ", "ลงพระปรมาภิไธย", "ออกว่าราชการ", "สำเร็จราชการแทน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("sending, appointing, receiving, and welcoming diplomats remain distinct", () => {
  assert.ok(!thesaurus.suggest("ส่งทูต").some(({ word }) => word === "แต่งตั้งเอกอัครราชทูต"));
  assert.ok(!thesaurus.suggest("รับรองทูต").some(({ word }) => word === "ให้การต้อนรับคณะผู้แทน"));
});

test("presenting, receiving, reading, and replying to royal letters remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้าเฝ้าถวายพระราชสาส์น").some(({ word }) => word === "น้อมรับพระราชสาส์น"));
  assert.ok(!thesaurus.suggest("รับพระราชสาส์น").some(({ word }) => word === "อัญเชิญพระราชสาส์นขึ้นอ่าน"));
  assert.ok(!thesaurus.suggest("อ่านพระราชสาส์น").some(({ word }) => word === "พระราชทานพระราชสาส์นตอบ"));
});

test("peace and trade negotiations remain distinct purposes", () => {
  assert.ok(!thesaurus.suggest("เจรจาสันติภาพ").some(({ word }) => word === "เจรจาข้อตกลงทางการค้า"));
});

test("offering, accepting, refusing, issuing, and withdrawing terms remain distinct", () => {
  assert.ok(!thesaurus.suggest("ยื่นข้อเสนอ").some(({ word }) => word === "ยอมรับข้อเสนอ"));
  assert.ok(!thesaurus.suggest("รับข้อเสนอ").some(({ word }) => word === "บอกปัดข้อเสนอ"));
  assert.ok(!thesaurus.suggest("ยื่นคำขาด").some(({ word }) => word === "เพิกถอนเงื่อนไขขั้นสุดท้าย"));
});

test("drafting, signing, ratifying, violating, and terminating treaties remain distinct", () => {
  assert.ok(!thesaurus.suggest("ร่างสนธิสัญญา").some(({ word }) => word === "ร่วมลงนามในข้อตกลงระหว่างรัฐ"));
  assert.ok(!thesaurus.suggest("ลงนามสนธิสัญญา").some(({ word }) => word === "รับรองสนธิสัญญาอย่างเป็นทางการ"));
  assert.ok(!thesaurus.suggest("ละเมิดสนธิสัญญา").some(({ word }) => word === "บอกเลิกสนธิสัญญา"));
});

test("establishing, cultivating, and severing relations remain distinct", () => {
  assert.ok(!thesaurus.suggest("สถาปนาความสัมพันธ์").some(({ word }) => word === "เจริญสัมพันธไมตรี"));
  assert.ok(!thesaurus.suggest("ผูกสัมพันธไมตรี").some(({ word }) => word === "ตัดสัมพันธ์ทางการทูต"));
});

test("sending, presenting, and receiving tribute remain distinct", () => {
  assert.ok(!thesaurus.suggest("ส่งเครื่องบรรณาการ").some(({ word }) => word === "นำเครื่องบรรณาการขึ้นถวาย"));
  assert.ok(!thesaurus.suggest("ถวายเครื่องบรรณาการ").some(({ word }) => word === "รับมอบของบรรณาการ"));
});

test("diplomatic and royal-letter alternatives retain intended registers", () => {
  assert.equal(thesaurus.suggest("ส่งทูต").find(({ word }) => word === "ส่งผู้แทนทางการทูต")?.register, "ทางการ");
  assert.equal(thesaurus.suggest("เข้าเฝ้าถวายพระราชสาส์น").find(({ word }) => word === "เข้าเฝ้าทูลเกล้าทูลกระหม่อมถวายพระราชสาส์น")?.register, "ราชาศัพท์");
  assert.equal(thesaurus.suggest("ถวายเครื่องบรรณาการ").find(({ word }) => word === "ทูลเกล้าทูลกระหม่อมถวายเครื่องราชบรรณาการ")?.register, "ราชาศัพท์");
});

test("diplomatic action entries preserve verb POS", () => {
  for (const word of ["ส่งทูต", "แต่งตั้งราชทูต", "รับรองทูต", "ต้อนรับคณะทูต", "เข้าเฝ้าถวายพระราชสาส์น", "ยื่นสาส์น", "รับพระราชสาส์น", "อ่านพระราชสาส์น", "ส่งพระราชสาส์นตอบ", "เปิดการเจรจา", "เจรจาสันติภาพ", "เจรจาการค้า", "เสนอเงื่อนไข", "ยื่นข้อเสนอ", "รับข้อเสนอ", "ปฏิเสธข้อเสนอ", "ยื่นคำขาด", "ถอนคำขาด", "บรรลุข้อตกลง", "ร่างสนธิสัญญา", "ลงนามสนธิสัญญา", "ให้สัตยาบัน", "แลกเปลี่ยนสัตยาบันสาร", "ละเมิดสนธิสัญญา", "ยกเลิกสนธิสัญญา", "สถาปนาความสัมพันธ์", "ตัดความสัมพันธ์", "ผูกสัมพันธไมตรี", "ส่งเครื่องบรรณาการ", "ถวายเครื่องบรรณาการ", "รับบรรณาการ", "ขอสงบศึก", "ทำสัญญาสงบศึก", "ถอนคณะทูต"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("reporting, receiving a complaint, and filing a formal grievance remain distinct", () => {
  assert.ok(!thesaurus.suggest("แจ้งความ").some(({ word }) => word === "บันทึกรับคำร้องทุกข์"));
  assert.ok(!thesaurus.suggest("รับแจ้งความ").some(({ word }) => word === "ยื่นคำร้องทุกข์"));
});

test("charging, denying charges, confessing, and giving a statement remain distinct", () => {
  assert.ok(!thesaurus.suggest("แจ้งข้อหา").some(({ word }) => word === "ให้การปฏิเสธข้อกล่าวหา"));
  assert.ok(!thesaurus.suggest("รับสารภาพ").some(({ word }) => word === "ให้ถ้อยคำต่อเจ้าหน้าที่"));
});

test("investigation, interrogation, and inquiry remain distinct procedures", () => {
  assert.ok(!thesaurus.suggest("สืบสวน").some(({ word }) => word === "ซักถามเพื่อบันทึกถ้อยคำ"));
  assert.ok(!thesaurus.suggest("สอบปากคำ").some(({ word }) => word === "ดำเนินการสอบสวนคดี"));
});

test("custody, remand, bail request, bail decision, and release remain distinct", () => {
  assert.ok(!thesaurus.suggest("ควบคุมตัว").some(({ word }) => word === "ยื่นคำร้องขอฝากขัง"));
  assert.ok(!thesaurus.suggest("ขอประกันตัว").some(({ word }) => word === "มีคำสั่งอนุญาตให้ปล่อยชั่วคราว"));
  assert.ok(!thesaurus.suggest("ปฏิเสธประกันตัว").some(({ word }) => word === "ปล่อยชั่วคราวตามคำสั่งศาล"));
});

test("prosecution order, filing, acceptance, and dismissal remain distinct", () => {
  assert.ok(!thesaurus.suggest("สั่งฟ้อง").some(({ word }) => word === "ยื่นคำฟ้องต่อศาล"));
  assert.ok(!thesaurus.suggest("ยื่นฟ้อง").some(({ word }) => word === "มีคำสั่งรับคำฟ้อง"));
  assert.ok(!thesaurus.suggest("รับฟ้อง").some(({ word }) => word === "พิพากษายกฟ้อง"));
});

test("calling, examining, questioning, objecting to, and submitting evidence remain distinct", () => {
  assert.ok(!thesaurus.suggest("เบิกพยาน").some(({ word }) => word === "ดำเนินการไต่ถามพยาน"));
  assert.ok(!thesaurus.suggest("ซักถามพยาน").some(({ word }) => word === "คัดค้านการรับฟังพยานหลักฐาน"));
  assert.ok(!thesaurus.suggest("ค้านพยานหลักฐาน").some(({ word }) => word === "นำพยานหลักฐานเข้าสู่สำนวน"));
});

test("closing arguments, judgment, reading, conviction, and sentencing remain distinct", () => {
  assert.ok(!thesaurus.suggest("แถลงปิดคดี").some(({ word }) => word === "มีคำพิพากษา"));
  assert.ok(!thesaurus.suggest("พิพากษา").some(({ word }) => word === "อ่านคำตัดสิน"));
  assert.ok(!thesaurus.suggest("ตัดสินว่าผิด").some(({ word }) => word === "กำหนดบทลงโทษ"));
});

test("appeal, supreme appeal, and enforcement remain distinct post-judgment actions", () => {
  assert.ok(!thesaurus.suggest("ยื่นอุทธรณ์").some(({ word }) => word === "ยื่นคำฎีกาต่อศาล"));
  assert.ok(!thesaurus.suggest("ยื่นฎีกา").some(({ word }) => word === "ดำเนินการตามคำพิพากษา"));
});

test("legal alternatives retain colloquial, general, formal, and literary ranks", () => {
  assert.equal(thesaurus.suggest("แจ้งความ").find(({ word }) => word === "ไปบอกตำรวจ")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ขอประกันตัว").find(({ word }) => word === "ยื่นคำร้องขอปล่อยชั่วคราว")?.register, "ทางการ");
  assert.equal(thesaurus.suggest("รอลงอาญา").find(({ word }) => word === "แขวนการลงโทษไว้")?.register, "วรรณกรรม");
});

test("legal procedure entries preserve verb POS", () => {
  for (const word of ["แจ้งความ", "รับแจ้งความ", "ร้องทุกข์", "แจ้งข้อหา", "ปฏิเสธข้อหา", "รับสารภาพ", "ให้การ", "ให้การปฏิเสธ", "สอบปากคำ", "สืบสวน", "สอบสวน", "ควบคุมตัว", "ฝากขัง", "ขอประกันตัว", "อนุญาตประกันตัว", "ปฏิเสธประกันตัว", "ปล่อยตัวชั่วคราว", "ส่งสำนวน", "สั่งฟ้อง", "สั่งไม่ฟ้อง", "ยื่นฟ้อง", "รับฟ้อง", "ยกฟ้อง", "นัดพิจารณาคดี", "เปิดการพิจารณาคดี", "เบิกพยาน", "สืบพยาน", "ซักถามพยาน", "ค้านพยานหลักฐาน", "ยื่นหลักฐาน", "รับฟังหลักฐาน", "แถลงปิดคดี", "พิพากษา", "อ่านคำพิพากษา", "ตัดสินว่าผิด", "ยกประโยชน์แห่งความสงสัย", "กำหนดโทษ", "รอลงอาญา", "ยื่นอุทธรณ์", "ยื่นฎีกา", "บังคับคดี"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("receiving, transporting, searching, and confiscating remain distinct prison intake steps", () => {
  assert.ok(!thesaurus.suggest("รับตัวผู้ต้องขัง").some(({ word }) => word === "นำส่งตัวเข้าเรือนจำ"));
  assert.ok(!thesaurus.suggest("ตรวจค้นผู้ต้องขัง").some(({ word }) => word === "ตรวจยึดสิ่งของต้องห้าม"));
});

test("applying and removing restraints remain opposite actions", () => {
  assert.ok(!thesaurus.suggest("ใส่กุญแจมือ").some(({ word }) => word === "ปลดกุญแจมือ"));
  assert.ok(!thesaurus.suggest("ใส่ตรวน").some(({ word }) => word === "ปลดโซ่ตรวน"));
});

test("general confinement, solitary confinement, separation, and transfer remain distinct", () => {
  assert.ok(!thesaurus.suggest("คุมขัง").some(({ word }) => word === "ควบคุมตัวในห้องขังเดี่ยว"));
  assert.ok(!thesaurus.suggest("แยกขัง").some(({ word }) => word === "โอนย้ายผู้ต้องขังไปยังเรือนจำอื่น"));
});

test("counting, lining up, opening, and locking cells remain distinct operations", () => {
  assert.ok(!thesaurus.suggest("นับยอดผู้ต้องขัง").some(({ word }) => word === "จัดแถวตรวจยอดผู้ต้องขัง"));
  assert.ok(!thesaurus.suggest("เปิดห้องขัง").some(({ word }) => word === "ปิดล็อกห้องขัง"));
});

test("visiting, receiving parcels, sending letters, working, and training remain distinct", () => {
  assert.ok(!thesaurus.suggest("เยี่ยมผู้ต้องขัง").some(({ word }) => word === "รับสิ่งของสำหรับผู้ต้องขัง"));
  assert.ok(!thesaurus.suggest("ส่งจดหมายจากเรือนจำ").some(({ word }) => word === "ปฏิบัติงานระหว่างต้องโทษ"));
  assert.ok(!thesaurus.suggest("ทำงานในเรือนจำ").some(({ word }) => word === "จัดการฝึกวิชาชีพแก่ผู้ต้องขัง"));
});

test("sentence reduction, suspension, probation, and release remain distinct", () => {
  assert.ok(!thesaurus.suggest("ขอลดวันต้องโทษ").some(({ word }) => word === "ยื่นคำขอพักการลงโทษ"));
  assert.ok(!thesaurus.suggest("ได้รับพักการลงโทษ").some(({ word }) => word === "ควบคุมและสอดส่องพฤติกรรม"));
  assert.ok(!thesaurus.suggest("พ้นโทษ").some(({ word }) => word === "ปล่อยตัวผู้ต้องขังออกจากเรือนจำ"));
});

test("escape, pursuit, and recapture remain distinct", () => {
  assert.ok(!thesaurus.suggest("หลบหนีจากเรือนจำ").some(({ word }) => word === "ติดตามจับกุมผู้หลบหนีจากที่คุมขัง"));
  assert.ok(!thesaurus.suggest("ติดตามจับผู้หลบหนี").some(({ word }) => word === "นำตัวผู้หลบหนีกลับเข้าสู่เรือนจำ"));
});

test("prison alternatives retain language-register boundaries", () => {
  assert.equal(thesaurus.suggest("ขอลดวันต้องโทษ").find(({ word }) => word === "ขอลดวันติดคุก")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ใส่ตรวน").find(({ word }) => word === "พันธนาการด้วยเครื่องจองจำ")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("ได้รับอภัยโทษ").find(({ word }) => word === "ได้รับพระราชทานอภัยโทษ")?.register, "ราชาศัพท์");
});

test("prison and release entries preserve verb POS", () => {
  for (const word of ["รับตัวผู้ต้องขัง", "นำตัวเข้าเรือนจำ", "ตรวจค้นผู้ต้องขัง", "ยึดของต้องห้าม", "ใส่กุญแจมือ", "ถอดกุญแจมือ", "ใส่ตรวน", "ถอดตรวน", "คุมขัง", "ขังเดี่ยว", "แยกขัง", "ย้ายเรือนจำ", "นับยอดผู้ต้องขัง", "เรียกแถวผู้ต้องขัง", "เปิดห้องขัง", "ล็อกห้องขัง", "แจกอาหารผู้ต้องขัง", "เยี่ยมผู้ต้องขัง", "รับของเยี่ยม", "ส่งจดหมายจากเรือนจำ", "ทำงานในเรือนจำ", "ฝึกอาชีพผู้ต้องขัง", "รักษาระเบียบในเรือนจำ", "ลงโทษทางวินัย", "ขอลดวันต้องโทษ", "ได้รับลดวันต้องโทษ", "ขอพักการลงโทษ", "ได้รับพักการลงโทษ", "คุมประพฤติ", "รายงานตัวต่อพนักงานคุมประพฤติ", "พ้นโทษ", "ปล่อยตัวจากเรือนจำ", "ได้รับอภัยโทษ", "หลบหนีจากเรือนจำ", "แหกคุก", "ติดตามจับผู้หลบหนี", "จับกลับเข้าเรือนจำ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("attendance check, answering roll, lateness, absence, and leave remain distinct", () => {
  assert.ok(!thesaurus.suggest("เช็กชื่อ").some(({ word }) => word === "แจ้งตัวเมื่อมีการเรียกชื่อ"));
  assert.ok(!thesaurus.suggest("มาเรียนสาย").some(({ word }) => word === "ไม่เข้าชั้นเรียน"));
  assert.ok(!thesaurus.suggest("ขาดเรียน").some(({ word }) => word === "ยื่นคำขอลาเรียน"));
});

test("listening, note-taking, asking, and answering remain distinct classroom actions", () => {
  assert.ok(!thesaurus.suggest("ฟังครูสอน").some(({ word }) => word === "บันทึกสาระการเรียน"));
  assert.ok(!thesaurus.suggest("ยกมือถาม").some(({ word }) => word === "ให้คำตอบในชั้นเรียน"));
});

test("exercises, homework creation, submission, checking, and correction remain distinct", () => {
  assert.ok(!thesaurus.suggest("ทำแบบฝึกหัด").some(({ word }) => word === "ปฏิบัติงานที่ได้รับมอบหมาย"));
  assert.ok(!thesaurus.suggest("ทำการบ้าน").some(({ word }) => word === "ส่งงานที่ได้รับมอบหมาย"));
  assert.ok(!thesaurus.suggest("ตรวจการบ้าน").some(({ word }) => word === "ปรับแก้งานตามข้อเสนอแนะ"));
});

test("reviewing, memorizing, tutoring, and group study remain distinct study methods", () => {
  assert.ok(!thesaurus.suggest("อ่านทบทวน").some(({ word }) => word === "จดจำเนื้อหาด้วยการท่อง"));
  assert.ok(!thesaurus.suggest("ติวหนังสือ").some(({ word }) => word === "เรียนรู้ร่วมกันเป็นกลุ่ม"));
});

test("report writing, presentation, and laboratory work remain distinct assignments", () => {
  assert.ok(!thesaurus.suggest("ทำรายงาน").some(({ word }) => word === "นำเสนอผลงานต่อชั้นเรียน"));
  assert.ok(!thesaurus.suggest("นำเสนอหน้าชั้น").some(({ word }) => word === "ปฏิบัติการทดลองในห้องทดลอง"));
});

test("library entry, borrowing, and returning remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้าใช้ห้องสมุด").some(({ word }) => word === "ขอยืมทรัพยากรห้องสมุด"));
  assert.ok(!thesaurus.suggest("ยืมหนังสือ").some(({ word }) => word === "ส่งคืนทรัพยากรห้องสมุด"));
});

test("exam registration, attendance, answering, cheating, and submission remain distinct", () => {
  assert.ok(!thesaurus.suggest("สมัครสอบ").some(({ word }) => word === "เข้ารับการสอบ"));
  assert.ok(!thesaurus.suggest("ทำข้อสอบ").some(({ word }) => word === "คัดลอกคำตอบโดยทุจริต"));
  assert.ok(!thesaurus.suggest("ลอกข้อสอบ").some(({ word }) => word === "ส่งแบบทดสอบแก่ผู้คุมสอบ"));
});

test("passing, failing, remedial examination, and score review remain distinct", () => {
  assert.ok(!thesaurus.suggest("สอบผ่าน").some(({ word }) => word === "ไม่ผ่านเกณฑ์การประเมิน"));
  assert.ok(!thesaurus.suggest("สอบตก").some(({ word }) => word === "เข้ารับการสอบแก้ผลการเรียน"));
  assert.ok(!thesaurus.suggest("สอบซ่อม").some(({ word }) => word === "ยื่นคำร้องขอทบทวนผลคะแนน"));
});

test("education alternatives retain colloquial, formal, and royal registers", () => {
  assert.equal(thesaurus.suggest("นำเสนอหน้าชั้น").find(({ word }) => word === "พรีเซนต์หน้าห้อง")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ทดลองในห้องปฏิบัติการ").find(({ word }) => word === "ปฏิบัติการทดลองในห้องทดลอง")?.register, "ทางการ");
  assert.equal(thesaurus.suggest("รับปริญญา").find(({ word }) => word === "เข้ารับพระราชทานปริญญาบัตร")?.register, "ราชาศัพท์");
});

test("education and examination entries preserve verb POS", () => {
  for (const word of ["เข้าเรียน", "เข้าแถวหน้าเสาธง", "เคารพธงชาติ", "เช็กชื่อ", "ขานชื่อ", "มาเรียนสาย", "ขาดเรียน", "ลาเรียน", "นั่งเรียน", "ฟังครูสอน", "จดบทเรียน", "ยกมือถาม", "ตอบคำถามในชั้นเรียน", "ทำแบบฝึกหัด", "ทำการบ้าน", "ส่งการบ้าน", "ตรวจการบ้าน", "แก้การบ้าน", "อ่านทบทวน", "ท่องจำ", "ติวหนังสือ", "เรียนเป็นกลุ่ม", "ทำรายงาน", "นำเสนอหน้าชั้น", "ทดลองในห้องปฏิบัติการ", "เข้าใช้ห้องสมุด", "ยืมหนังสือ", "คืนหนังสือ", "สมัครสอบ", "เข้าสอบ", "ทำข้อสอบ", "ลอกข้อสอบ", "ส่งข้อสอบ", "ตรวจข้อสอบ", "ประกาศผลสอบ", "สอบผ่าน", "สอบตก", "สอบซ่อม", "ขอทบทวนคะแนน", "จบการศึกษา", "รับปริญญา"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("job search, application, resume preparation, and submission remain distinct", () => {
  assert.ok(!thesaurus.suggest("หางาน").some(({ word }) => word === "ยื่นใบสมัครงาน"));
  assert.ok(!thesaurus.suggest("ส่งประวัติสมัครงาน").some(({ word }) => word === "จัดทำประวัติย่อเพื่อสมัครงาน"));
});

test("interview scheduling, attendance, answering, and salary negotiation remain distinct", () => {
  assert.ok(!thesaurus.suggest("นัดสัมภาษณ์งาน").some(({ word }) => word === "เข้ารับการสัมภาษณ์เพื่อคัดเลือก"));
  assert.ok(!thesaurus.suggest("ตอบคำถามสัมภาษณ์").some(({ word }) => word === "เจรจาค่าตอบแทน"));
});

test("hiring, rejecting, contracting, and starting work remain distinct", () => {
  assert.ok(!thesaurus.suggest("รับเข้าทำงาน").some(({ word }) => word === "แจ้งไม่ผ่านการคัดเลือก"));
  assert.ok(!thesaurus.suggest("เซ็นสัญญาจ้าง").some(({ word }) => word === "เริ่มปฏิบัติงานวันแรก"));
});

test("arriving, clocking in, lateness, leave, sick leave, and vacation remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้างาน").some(({ word }) => word === "บันทึกเวลาเริ่มปฏิบัติงาน"));
  assert.ok(!thesaurus.suggest("มาทำงานสาย").some(({ word }) => word === "ยื่นคำขอลาหยุด"));
  assert.ok(!thesaurus.suggest("ลาป่วย").some(({ word }) => word === "ใช้สิทธิวันลาพักผ่อน"));
});

test("assigning, accepting, planning, and distributing work remain distinct", () => {
  assert.ok(!thesaurus.suggest("มอบหมายงาน").some(({ word }) => word === "รับหน้าที่ที่ได้รับมอบหมาย"));
  assert.ok(!thesaurus.suggest("วางแผนงาน").some(({ word }) => word === "จัดสรรภาระงาน"));
});

test("coordination, tracking, expediting, overtime, and delivery remain distinct", () => {
  assert.ok(!thesaurus.suggest("ประสานงาน").some(({ word }) => word === "ตรวจสอบความคืบหน้าของงาน"));
  assert.ok(!thesaurus.suggest("เร่งงาน").some(({ word }) => word === "ปฏิบัติงานนอกเวลาปกติ"));
  assert.ok(!thesaurus.suggest("ทำงานล่วงเวลา").some(({ word }) => word === "ส่งมอบผลงาน"));
});

test("revision, inspection, progress reporting, and appraisal remain distinct", () => {
  assert.ok(!thesaurus.suggest("แก้งาน").some(({ word }) => word === "ตรวจสอบคุณภาพงาน"));
  assert.ok(!thesaurus.suggest("รายงานความคืบหน้า").some(({ word }) => word === "ประเมินผลการปฏิบัติงาน"));
});

test("pay raise request, adjustment, promotion, transfer, suspension, resignation, and termination remain distinct", () => {
  assert.ok(!thesaurus.suggest("ขอขึ้นเงินเดือน").some(({ word }) => word === "ปรับอัตราค่าตอบแทน"));
  assert.ok(!thesaurus.suggest("เลื่อนตำแหน่ง").some(({ word }) => word === "โอนย้ายไปดำรงตำแหน่งอื่น"));
  assert.ok(!thesaurus.suggest("ลาออก").some(({ word }) => word === "ยุติสัญญาจ้าง"));
});

test("workplace alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("ส่งประวัติสมัครงาน").find(({ word }) => word === "ส่งเรซูเม่")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ทำงานล่วงเวลา").find(({ word }) => word === "ทำโอที")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ลาออก").find(({ word }) => word === "ยื่นหนังสือลาออก")?.register, "ทางการ");
});

test("workplace lifecycle entries preserve verb POS", () => {
  for (const word of ["หางาน", "สมัครงาน", "ส่งประวัติสมัครงาน", "เขียนประวัติสมัครงาน", "นัดสัมภาษณ์งาน", "เข้าสัมภาษณ์งาน", "ตอบคำถามสัมภาษณ์", "ต่อรองเงินเดือน", "รับเข้าทำงาน", "ปฏิเสธผู้สมัคร", "เซ็นสัญญาจ้าง", "เริ่มงานวันแรก", "เข้างาน", "ตอกบัตรเข้างาน", "มาทำงานสาย", "ลางาน", "ลาป่วย", "ลาพักร้อน", "มอบหมายงาน", "รับมอบหมายงาน", "วางแผนงาน", "แบ่งงาน", "ประสานงาน", "ติดตามงาน", "เร่งงาน", "ทำงานล่วงเวลา", "ส่งงาน", "แก้งาน", "ตรวจงาน", "รายงานความคืบหน้า", "ประเมินผลงาน", "ชมเชยผลงาน", "ตักเตือนพนักงาน", "ขอขึ้นเงินเดือน", "ปรับเงินเดือน", "เลื่อนตำแหน่ง", "โยกย้ายตำแหน่ง", "พักงาน", "ลาออก", "เลิกจ้าง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("opening and closing accounts remain opposite banking actions", () => {
  assert.ok(!thesaurus.suggest("เปิดบัญชีธนาคาร").some(({ word }) => word === "ดำเนินการปิดบัญชีเงินฝาก"));
});

test("depositing, withdrawing, checking balances, and receiving transfers remain distinct", () => {
  assert.ok(!thesaurus.suggest("ฝากเงิน").some(({ word }) => word === "เบิกถอนเงินจากบัญชี"));
  assert.ok(!thesaurus.suggest("ตรวจยอดเงิน").some(({ word }) => word === "รับเงินผ่านบัญชี"));
});

test("cash withdrawal, card payment, card bill payment, and card suspension remain distinct", () => {
  assert.ok(!thesaurus.suggest("กดเงินสด").some(({ word }) => word === "ชำระเงินผ่านบัตร"));
  assert.ok(!thesaurus.suggest("ชำระบัตรเครดิต").some(({ word }) => word === "ระงับการใช้บัตรชั่วคราว"));
});

test("credit application, loan application, review, approval, and refusal remain distinct", () => {
  assert.ok(!thesaurus.suggest("สมัครสินเชื่อ").some(({ word }) => word === "ยื่นคำขอกู้ยืม"));
  assert.ok(!thesaurus.suggest("ตรวจเครดิต").some(({ word }) => word === "พิจารณาอนุมัติวงเงินสินเชื่อ"));
  assert.ok(!thesaurus.suggest("อนุมัติสินเชื่อ").some(({ word }) => word === "ไม่อนุมัติคำขอสินเชื่อ"));
});

test("loan signing, disbursement, guarantee, and mortgage remain distinct", () => {
  assert.ok(!thesaurus.suggest("เซ็นสัญญากู้").some(({ word }) => word === "รับเงินที่เบิกจ่ายตามสัญญากู้"));
  assert.ok(!thesaurus.suggest("ค้ำประกัน").some(({ word }) => word === "นำทรัพย์สินเข้าจำนอง"));
});

test("installments, debt repayment, interest, and prepayment remain distinct", () => {
  assert.ok(!thesaurus.suggest("ผ่อนชำระ").some(({ word }) => word === "ชำระภาระหนี้"));
  assert.ok(!thesaurus.suggest("จ่ายดอกเบี้ย").some(({ word }) => word === "ชำระคืนก่อนครบกำหนด"));
});

test("arrears, default, collection, restructuring, seizure, and auction remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้างชำระ").some(({ word }) => word === "ผิดนัดตามภาระหนี้"));
  assert.ok(!thesaurus.suggest("ทวงหนี้").some(({ word }) => word === "เปลี่ยนเงื่อนไขการชำระหนี้"));
  assert.ok(!thesaurus.suggest("ยึดทรัพย์").some(({ word }) => word === "จำหน่ายทรัพย์โดยการขายทอดตลาด"));
});

test("issuing, depositing, cashing, and bouncing checks remain distinct", () => {
  assert.ok(!thesaurus.suggest("ออกเช็ค").some(({ word }) => word === "นำเช็คเข้าฝากเรียกเก็บ"));
  assert.ok(!thesaurus.suggest("ฝากเช็ค").some(({ word }) => word === "นำเช็คไปเรียกเก็บเงิน"));
  assert.ok(!thesaurus.suggest("ขึ้นเงินเช็ค").some(({ word }) => word === "ธนาคารปฏิเสธการจ่ายเงินตามเช็ค"));
});

test("financial alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("กดเงินสด").find(({ word }) => word === "กดเงิน")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ตรวจเครดิต").find(({ word }) => word === "เช็กเครดิต")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("อายัดบัญชี").find(({ word }) => word === "สั่งห้ามทำธุรกรรมในบัญชี")?.register, "ทางการ");
});

test("banking, credit, and debt entries preserve verb POS", () => {
  for (const word of ["เปิดบัญชีธนาคาร", "ปิดบัญชีธนาคาร", "ฝากเงิน", "ถอนเงิน", "ตรวจยอดเงิน", "รับเงินโอน", "เติมเงินเข้าบัญชี", "แลกเงิน", "กดเงินสด", "รูดบัตร", "ชำระบัตรเครดิต", "อายัดบัตร", "แจ้งบัตรหาย", "สมัครสินเชื่อ", "ยื่นกู้", "ตรวจเครดิต", "อนุมัติสินเชื่อ", "ปฏิเสธสินเชื่อ", "เซ็นสัญญากู้", "รับเงินกู้", "ค้ำประกัน", "จำนองทรัพย์", "ผ่อนชำระ", "ชำระหนี้", "จ่ายดอกเบี้ย", "ชำระหนี้ก่อนกำหนด", "ค้างชำระ", "ผิดนัดชำระหนี้", "ทวงหนี้", "ปรับโครงสร้างหนี้", "ยึดทรัพย์", "ขายทอดตลาด", "ออกเช็ค", "ฝากเช็ค", "ขึ้นเงินเช็ค", "เช็คเด้ง", "ระงับธุรกรรม", "อายัดบัญชี", "ปลดอายัดบัญชี"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("searching, scheduling, viewing, inspecting, and accepting a rental remain distinct", () => {
  assert.ok(!thesaurus.suggest("หาห้องเช่า").some(({ word }) => word === "กำหนดเวลาเข้าชมห้องเช่า"));
  assert.ok(!thesaurus.suggest("ดูห้องเช่า").some(({ word }) => word === "ตรวจสอบสภาพทรัพย์สินเช่า"));
  assert.ok(!thesaurus.suggest("ตรวจสภาพห้อง").some(({ word }) => word === "ตอบรับการเช่าทรัพย์สิน"));
});

test("reservation, security deposit, lease signing, and key receipt remain distinct", () => {
  assert.ok(!thesaurus.suggest("วางเงินจอง").some(({ word }) => word === "ชำระเงินประกันการเช่า"));
  assert.ok(!thesaurus.suggest("เซ็นสัญญาเช่า").some(({ word }) => word === "รับมอบกุญแจสถานที่เช่า"));
});

test("moving in, carrying belongings, and reporting an address remain distinct", () => {
  assert.ok(!thesaurus.suggest("ย้ายเข้า").some(({ word }) => word === "ขนย้ายทรัพย์สินเข้าสู่ที่พัก"));
  assert.ok(!thesaurus.suggest("ขนของเข้าบ้าน").some(({ word }) => word === "แจ้งเปลี่ยนแปลงที่อยู่"));
});

test("rent payment, arrears, collection, and delayed-payment request remain distinct", () => {
  assert.ok(!thesaurus.suggest("จ่ายค่าเช่า").some(({ word }) => word === "มียอดค่าเช่าค้างชำระ"));
  assert.ok(!thesaurus.suggest("ทวงค่าเช่า").some(({ word }) => word === "ขอขยายกำหนดชำระค่าเช่า"));
});

test("lease renewal, rent increase request, and rent adjustment remain distinct", () => {
  assert.ok(!thesaurus.suggest("ต่อสัญญาเช่า").some(({ word }) => word === "เสนอปรับเพิ่มอัตราค่าเช่า"));
  assert.ok(!thesaurus.suggest("ขอขึ้นค่าเช่า").some(({ word }) => word === "ปรับอัตราค่าเช่า"));
});

test("maintenance request and repair visit remain distinct", () => {
  assert.ok(!thesaurus.suggest("แจ้งซ่อม").some(({ word }) => word === "เข้าดำเนินการซ่อมบำรุง"));
  assert.ok(!thesaurus.suggest("ซ่อมท่อน้ำ").some(({ word }) => word === "ซ่อมแซมระบบไฟฟ้า"));
});

test("noise complaint, neighbor warning, and building report remain distinct", () => {
  assert.ok(!thesaurus.suggest("ร้องเรียนเสียงดัง").some(({ word }) => word === "แจ้งเตือนผู้พักอาศัยข้างเคียง"));
  assert.ok(!thesaurus.suggest("เตือนเพื่อนบ้าน").some(({ word }) => word === "แจ้งเรื่องต่อผู้จัดการอาคาร"));
});

test("move-out notice, lease termination, moving belongings, key return, and inspection remain distinct", () => {
  assert.ok(!thesaurus.suggest("แจ้งย้ายออก").some(({ word }) => word === "แจ้งยุติความผูกพันตามสัญญาเช่า"));
  assert.ok(!thesaurus.suggest("ขนของออก").some(({ word }) => word === "ส่งมอบกุญแจคืนผู้ให้เช่า"));
  assert.ok(!thesaurus.suggest("คืนกุญแจห้อง").some(({ word }) => word === "ตรวจรับสภาพทรัพย์สินเมื่อสิ้นสุดการเช่า"));
});

test("rental alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("เซ็นสัญญาเช่า").find(({ word }) => word === "เซ็นสัญญาห้อง")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ร้องเรียนเสียงดัง").find(({ word }) => word === "บ่นเรื่องเสียงดัง")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("คืนเงินประกัน").find(({ word }) => word === "ชำระคืนเงินประกันการเช่า")?.register, "ทางการ");
});

test("rental and housing entries preserve verb POS", () => {
  for (const word of ["หาห้องเช่า", "นัดดูห้อง", "ดูห้องเช่า", "ตรวจสภาพห้อง", "ตกลงเช่า", "วางเงินจอง", "จ่ายเงินประกัน", "เซ็นสัญญาเช่า", "รับกุญแจห้อง", "ย้ายเข้า", "ขนของเข้าบ้าน", "แจ้งย้ายที่อยู่", "จ่ายค่าเช่า", "ค้างค่าเช่า", "ทวงค่าเช่า", "ขอเลื่อนจ่ายค่าเช่า", "ต่อสัญญาเช่า", "ขอขึ้นค่าเช่า", "ปรับค่าเช่า", "แจ้งซ่อม", "เข้าซ่อม", "ซ่อมท่อน้ำ", "ซ่อมไฟฟ้า", "เปลี่ยนหลอดไฟ", "แก้ท่อตัน", "กำจัดปลวก", "ทำความสะอาดพื้นที่ส่วนกลาง", "ร้องเรียนเสียงดัง", "เตือนเพื่อนบ้าน", "แจ้งนิติบุคคล", "ขออนุญาตเลี้ยงสัตว์", "ทำกุญแจหาย", "เปลี่ยนกุญแจ", "แจ้งย้ายออก", "บอกเลิกสัญญาเช่า", "ขนของออก", "คืนกุญแจห้อง", "ตรวจห้องก่อนคืน", "หักเงินประกัน", "คืนเงินประกัน"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("hotel search, booking, confirmation, cancellation, and date change remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้นหาโรงแรม").some(({ word }) => word === "สำรองห้องพัก"));
  assert.ok(!thesaurus.suggest("ยืนยันการจอง").some(({ word }) => word === "ยกเลิกรายการสำรองห้องพัก"));
  assert.ok(!thesaurus.suggest("เปลี่ยนวันเข้าพัก").some(({ word }) => word === "ยืนยันรายการสำรองห้องพัก"));
});

test("adjacent-room, extra-bed, and arrival-time requests remain distinct", () => {
  assert.ok(!thesaurus.suggest("ขอห้องติดกัน").some(({ word }) => word === "ร้องขอเตียงเสริมในห้องพัก"));
  assert.ok(!thesaurus.suggest("ขอเตียงเสริม").some(({ word }) => word === "แจ้งเวลาโดยประมาณที่จะเข้าพัก"));
});

test("arrival, check-in, identification, deposit, and key-card receipt remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินทางถึงโรงแรม").some(({ word }) => word === "ลงทะเบียนเข้าพัก"));
  assert.ok(!thesaurus.suggest("ยื่นบัตรประจำตัว").some(({ word }) => word === "ชำระเงินประกันความเสียหาย"));
  assert.ok(!thesaurus.suggest("วางเงินประกันห้องพัก").some(({ word }) => word === "รับบัตรผ่านเข้าห้องพัก"));
});

test("room inspection, room change, damage report, and housekeeping request remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตรวจห้องพัก").some(({ word }) => word === "ยื่นคำขอเปลี่ยนห้องพัก"));
  assert.ok(!thesaurus.suggest("แจ้งของชำรุด").some(({ word }) => word === "ขอรับบริการทำความสะอาดห้องพัก"));
});

test("room service ordering, food reception, minibar use, and wake-up calls remain distinct", () => {
  assert.ok(!thesaurus.suggest("สั่งรูมเซอร์วิส").some(({ word }) => word === "รับมอบอาหารภายในห้องพัก"));
  assert.ok(!thesaurus.suggest("ใช้มินิบาร์").some(({ word }) => word === "ขอรับบริการโทรปลุก"));
});

test("luggage deposit and retrieval remain opposite hotel services", () => {
  assert.ok(!thesaurus.suggest("ฝากสัมภาระ").some(({ word }) => word === "ขอรับสัมภาระที่ฝากไว้คืน"));
});

test("service complaint and room refund request remain distinct", () => {
  assert.ok(!thesaurus.suggest("ร้องเรียนบริการ").some(({ word }) => word === "ยื่นคำขอคืนค่าที่พัก"));
});

test("checkout notice, packing, minibar inspection, key return, payment, and checkout remain distinct", () => {
  assert.ok(!thesaurus.suggest("แจ้งเช็กเอาต์").some(({ word }) => word === "รวบรวมสัมภาระก่อนออกจากห้องพัก"));
  assert.ok(!thesaurus.suggest("ตรวจมินิบาร์").some(({ word }) => word === "ส่งคืนบัตรผ่านเข้าห้องพัก"));
  assert.ok(!thesaurus.suggest("ชำระค่าห้อง").some(({ word }) => word === "ดำเนินการคืนห้องพัก"));
});

test("hotel alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("ยืนยันการจอง").find(({ word }) => word === "คอนเฟิร์มการจอง")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ร้องเรียนบริการ").find(({ word }) => word === "บ่นเรื่องบริการ")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เช็กเอาต์โรงแรม").find(({ word }) => word === "ดำเนินการคืนห้องพัก")?.register, "ทางการ");
});

test("hotel guest-service entries preserve verb POS", () => {
  for (const word of ["ค้นหาโรงแรม", "จองห้องพัก", "ยืนยันการจอง", "ยกเลิกการจอง", "เปลี่ยนวันเข้าพัก", "ขอห้องติดกัน", "ขอเตียงเสริม", "แจ้งเวลาเข้าพัก", "เดินทางถึงโรงแรม", "เช็กอินโรงแรม", "ยื่นบัตรประจำตัว", "วางเงินประกันห้องพัก", "รับคีย์การ์ด", "ขนกระเป๋าขึ้นห้อง", "เปิดประตูห้องพัก", "ตรวจห้องพัก", "ขอเปลี่ยนห้อง", "แจ้งของชำรุด", "เรียกแม่บ้าน", "ทำความสะอาดห้องพัก", "เปลี่ยนผ้าเช็ดตัว", "สั่งรูมเซอร์วิส", "รับอาหารที่ห้อง", "ใช้มินิบาร์", "ขอปลุกตอนเช้า", "ฝากสัมภาระ", "รับสัมภาระคืน", "ขอข้อมูลท่องเที่ยว", "เรียกรถจากโรงแรม", "ร้องเรียนบริการ", "ขอคืนเงินค่าห้อง", "แจ้งเช็กเอาต์", "เก็บกระเป๋าออกจากห้อง", "ตรวจมินิบาร์", "คืนคีย์การ์ด", "ชำระค่าห้อง", "ขอใบเสร็จโรงแรม", "เช็กเอาต์โรงแรม", "ออกจากโรงแรม"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("flight search, booking, seat selection, confirmation, change, and cancellation remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้นหาเที่ยวบิน").some(({ word }) => word === "สำรองบัตรโดยสารเครื่องบิน"));
  assert.ok(!thesaurus.suggest("เลือกที่นั่งบนเครื่อง").some(({ word }) => word === "ยืนยันรายการบัตรโดยสาร"));
  assert.ok(!thesaurus.suggest("เปลี่ยนเที่ยวบิน").some(({ word }) => word === "ยกเลิกบัตรโดยสารเครื่องบิน"));
});

test("online check-in, airport arrival, counter search, and airport check-in remain distinct", () => {
  assert.ok(!thesaurus.suggest("เช็กอินออนไลน์").some(({ word }) => word === "เดินทางมาถึงท่าอากาศยาน"));
  assert.ok(!thesaurus.suggest("หาเคาน์เตอร์เช็กอิน").some(({ word }) => word === "ลงทะเบียนผู้โดยสารก่อนเดินทาง"));
});

test("passport presentation, weighing, baggage check, excess payment, and boarding-pass receipt remain distinct", () => {
  assert.ok(!thesaurus.suggest("ยื่นหนังสือเดินทาง").some(({ word }) => word === "ตรวจวัดน้ำหนักสัมภาระ"));
  assert.ok(!thesaurus.suggest("โหลดสัมภาระ").some(({ word }) => word === "ชำระค่าระวางสัมภาระเกินกำหนด"));
  assert.ok(!thesaurus.suggest("จ่ายค่าน้ำหนักเกิน").some(({ word }) => word === "รับบัตรโดยสารสำหรับขึ้นอากาศยาน"));
});

test("security screening and immigration remain distinct airport controls", () => {
  assert.ok(!thesaurus.suggest("ผ่านด่านตรวจความปลอดภัย").some(({ word }) => word === "ผ่านพิธีการตรวจคนเข้าเมือง"));
  assert.ok(!thesaurus.suggest("ผ่านตรวจคนเข้าเมือง").some(({ word }) => word === "ลงตราอนุญาตในหนังสือเดินทาง"));
});

test("gate search, waiting, boarding announcement, queueing, and scanning remain distinct", () => {
  assert.ok(!thesaurus.suggest("หาประตูขึ้นเครื่อง").some(({ word }) => word === "รอเวลาเรียกผู้โดยสารขึ้นอากาศยาน"));
  assert.ok(!thesaurus.suggest("ประกาศเรียกขึ้นเครื่อง").some(({ word }) => word === "เข้าคิวผ่านประตูขึ้นเครื่อง"));
  assert.ok(!thesaurus.suggest("ต่อแถวขึ้นเครื่อง").some(({ word }) => word === "ตรวจบัตรโดยสารก่อนขึ้นอากาศยาน"));
});

test("boarding, stowing bags, buckling up, and switching off phones remain distinct", () => {
  assert.ok(!thesaurus.suggest("ขึ้นเครื่องบิน").some(({ word }) => word === "จัดเก็บสัมภาระในช่องเหนือที่นั่ง"));
  assert.ok(!thesaurus.suggest("คาดเข็มขัดบนเครื่อง").some(({ word }) => word === "ปิดอุปกรณ์สื่อสารระหว่างเที่ยวบิน"));
});

test("pushback, takeoff, turbulence, landing, and disembarkation remain distinct flight stages", () => {
  assert.ok(!thesaurus.suggest("เครื่องบินออกจากหลุมจอด").some(({ word }) => word === "อากาศยานวิ่งขึ้นจากทางวิ่ง"));
  assert.ok(!thesaurus.suggest("เครื่องบินตกหลุมอากาศ").some(({ word }) => word === "อากาศยานร่อนลงสู่ทางวิ่ง"));
  assert.ok(!thesaurus.suggest("เครื่องบินลงจอด").some(({ word }) => word === "ออกจากอากาศยานหลังลงจอด"));
});

test("connection, delay, cancellation, and missed flight remain distinct disruptions", () => {
  assert.ok(!thesaurus.suggest("ต่อเครื่อง").some(({ word }) => word === "เที่ยวบินออกช้ากว่ากำหนด"));
  assert.ok(!thesaurus.suggest("เที่ยวบินล่าช้า").some(({ word }) => word === "สายการบินยกเลิกเที่ยวบิน"));
  assert.ok(!thesaurus.suggest("เที่ยวบินถูกยกเลิก").some(({ word }) => word === "พลาดเที่ยวบินตามกำหนด"));
});

test("airport alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("ค้นหาเที่ยวบิน").find(({ word }) => word === "หาไฟลต์")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เครื่องบินขึ้น").find(({ word }) => word === "ทะยานขึ้น")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("แจ้งกระเป๋าหาย").find(({ word }) => word === "แจ้งสัมภาระสูญหายต่อสายการบิน")?.register, "ทางการ");
});

test("airport and flight entries preserve verb POS", () => {
  for (const word of ["ค้นหาเที่ยวบิน", "จองตั๋วเครื่องบิน", "เลือกที่นั่งบนเครื่อง", "ยืนยันตั๋วเครื่องบิน", "เปลี่ยนเที่ยวบิน", "ยกเลิกตั๋วเครื่องบิน", "เช็กอินออนไลน์", "เดินทางถึงสนามบิน", "หาเคาน์เตอร์เช็กอิน", "เช็กอินเที่ยวบิน", "ยื่นหนังสือเดินทาง", "ชั่งกระเป๋า", "โหลดสัมภาระ", "จ่ายค่าน้ำหนักเกิน", "รับบัตรขึ้นเครื่อง", "ผ่านด่านตรวจความปลอดภัย", "ถอดเข็มขัดเข้าจุดตรวจ", "นำของเหลวออกจากกระเป๋า", "ผ่านตรวจคนเข้าเมือง", "ประทับตราหนังสือเดินทาง", "หาประตูขึ้นเครื่อง", "รอขึ้นเครื่อง", "ประกาศเรียกขึ้นเครื่อง", "ต่อแถวขึ้นเครื่อง", "สแกนบัตรขึ้นเครื่อง", "ขึ้นเครื่องบิน", "เก็บกระเป๋าเหนือศีรษะ", "คาดเข็มขัดบนเครื่อง", "ปิดโทรศัพท์บนเครื่อง", "เครื่องบินออกจากหลุมจอด", "เครื่องบินขึ้น", "เครื่องบินตกหลุมอากาศ", "เครื่องบินลงจอด", "ลงจากเครื่องบิน", "ต่อเครื่อง", "เที่ยวบินล่าช้า", "เที่ยวบินถูกยกเลิก", "ตกเครื่อง", "รับกระเป๋าที่สายพาน", "แจ้งกระเป๋าหาย"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("train search, schedule lookup, ticket purchase, and seat reservation remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้นหาเที่ยวรถไฟ").some(({ word }) => word === "ตรวจสอบตารางเดินรถ"));
  assert.ok(!thesaurus.suggest("ซื้อตั๋วรถไฟ").some(({ word }) => word === "สำรองที่นั่งในขบวนรถ"));
});

test("ticket receipt, change, and refund remain distinct", () => {
  assert.ok(!thesaurus.suggest("รับตั๋วรถไฟ").some(({ word }) => word === "แก้ไขรายการบัตรโดยสารรถไฟ"));
  assert.ok(!thesaurus.suggest("เปลี่ยนตั๋วรถไฟ").some(({ word }) => word === "ขอคืนบัตรโดยสารรถไฟ"));
});

test("station arrival, platform search, sign reading, ticket inspection, and gate passage remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินทางถึงสถานีรถไฟ").some(({ word }) => word === "ค้นหาชานชาลาตามหมายเลข"));
  assert.ok(!thesaurus.suggest("อ่านป้ายสถานี").some(({ word }) => word === "ตรวจบัตรโดยสารก่อนผ่านเข้าสถานี"));
  assert.ok(!thesaurus.suggest("ตรวจตั๋วก่อนเข้าสถานี").some(({ word }) => word === "ผ่านเครื่องกั้นทางเข้าออกสถานี"));
});

test("waiting, announcements, train arrival, queueing, and boarding remain distinct", () => {
  assert.ok(!thesaurus.suggest("รอรถไฟ").some(({ word }) => word === "รับฟังประกาศภายในสถานี"));
  assert.ok(!thesaurus.suggest("รถไฟเข้าสถานี").some(({ word }) => word === "เข้าคิวโดยสารขบวนรถ"));
  assert.ok(!thesaurus.suggest("ต่อแถวขึ้นรถไฟ").some(({ word }) => word === "โดยสารขึ้นรถไฟ"));
});

test("boarding, luggage loading, seat search, and baggage storage remain distinct", () => {
  assert.ok(!thesaurus.suggest("ยกกระเป๋าขึ้นรถไฟ").some(({ word }) => word === "ค้นหาที่นั่งตามหมายเลข"));
  assert.ok(!thesaurus.suggest("หาที่นั่งบนรถไฟ").some(({ word }) => word === "จัดเก็บสัมภาระในพื้นที่ที่กำหนด"));
});

test("sitting, standing, holding a rail, and clearing the exit remain distinct", () => {
  assert.ok(!thesaurus.suggest("นั่งรถไฟ").some(({ word }) => word === "โดยสารในท่ายืน"));
  assert.ok(!thesaurus.suggest("จับราวบนรถไฟ").some(({ word }) => word === "เว้นทางให้ผู้โดยสารออกจากขบวน"));
});

test("door closing, station departure, onboard inspection, and intermediate stop remain distinct", () => {
  assert.ok(!thesaurus.suggest("ประตูรถไฟปิด").some(({ word }) => word === "ขบวนรถเคลื่อนออกจากสถานี"));
  assert.ok(!thesaurus.suggest("ตรวจตั๋วบนรถไฟ").some(({ word }) => word === "รถไฟหยุดนอกสถานีชั่วคราว"));
});

test("delay, terminal arrival, preparation, baggage retrieval, and disembarkation remain distinct", () => {
  assert.ok(!thesaurus.suggest("รถไฟล่าช้า").some(({ word }) => word === "รถไฟเดินทางถึงสถานีปลายทาง"));
  assert.ok(!thesaurus.suggest("เตรียมลงรถไฟ").some(({ word }) => word === "นำสัมภาระออกจากที่เก็บ"));
  assert.ok(!thesaurus.suggest("หยิบสัมภาระลงรถไฟ").some(({ word }) => word === "ออกจากรถไฟเมื่อถึงสถานี"));
});

test("rail alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("ดูตารางรถไฟ").find(({ word }) => word === "เช็กเวลารถไฟ")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ขึ้นรถไฟ").find(({ word }) => word === "ก้าวขึ้นขบวน")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("แตะบัตรออกจากสถานี").find(({ word }) => word === "ใช้บัตรโดยสารผ่านประตูออกจากสถานี")?.register, "ทางการ");
});

test("train and station entries preserve verb POS", () => {
  for (const word of ["ค้นหาเที่ยวรถไฟ", "ดูตารางรถไฟ", "ซื้อตั๋วรถไฟ", "จองที่นั่งรถไฟ", "รับตั๋วรถไฟ", "เปลี่ยนตั๋วรถไฟ", "คืนตั๋วรถไฟ", "เดินทางถึงสถานีรถไฟ", "หาชานชาลา", "อ่านป้ายสถานี", "ตรวจตั๋วก่อนเข้าสถานี", "ผ่านประตูกั้นสถานี", "รอรถไฟ", "ฟังประกาศสถานี", "รถไฟเข้าสถานี", "ต่อแถวขึ้นรถไฟ", "ขึ้นรถไฟ", "ยกกระเป๋าขึ้นรถไฟ", "หาที่นั่งบนรถไฟ", "เก็บสัมภาระบนรถไฟ", "นั่งรถไฟ", "ยืนบนรถไฟ", "จับราวบนรถไฟ", "หลบให้ผู้โดยสารลง", "ประตูรถไฟปิด", "รถไฟออกจากสถานี", "ตรวจตั๋วบนรถไฟ", "ซื้ออาหารบนรถไฟ", "นอนบนรถไฟ", "รถไฟจอดระหว่างทาง", "รถไฟล่าช้า", "รถไฟถึงปลายทาง", "เตรียมลงรถไฟ", "หยิบสัมภาระลงรถไฟ", "ลงจากรถไฟ", "เปลี่ยนขบวนรถไฟ", "ต่อรถไฟฟ้า", "แตะบัตรเข้าสถานี", "เติมเงินบัตรโดยสาร", "แตะบัตรออกจากสถานี"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("box selection, assembly, wrapping, cushioning, and sealing remain distinct", () => {
  assert.ok(!thesaurus.suggest("เลือกกล่องพัสดุ").some(({ word }) => word === "ขึ้นรูปกล่องบรรจุภัณฑ์"));
  assert.ok(!thesaurus.suggest("ห่อพัสดุ").some(({ word }) => word === "บรรจุวัสดุป้องกันการกระแทก"));
  assert.ok(!thesaurus.suggest("ใส่วัสดุกันกระแทก").some(({ word }) => word === "ผนึกบรรจุภัณฑ์ให้เรียบร้อย"));
});

test("weighing, measuring, addressing, and labeling remain distinct parcel preparation steps", () => {
  assert.ok(!thesaurus.suggest("ชั่งพัสดุ").some(({ word }) => word === "ตรวจวัดมิติของบรรจุภัณฑ์"));
  assert.ok(!thesaurus.suggest("เขียนที่อยู่ผู้รับ").some(({ word }) => word === "ติดฉลากข้อมูลการจัดส่ง"));
});

test("service selection, price calculation, payment, deposit, receipt, and tracking number remain distinct", () => {
  assert.ok(!thesaurus.suggest("เลือกบริการจัดส่ง").some(({ word }) => word === "คำนวณอัตราค่าขนส่ง"));
  assert.ok(!thesaurus.suggest("ชำระค่าส่ง").some(({ word }) => word === "นำพัสดุเข้าฝากส่ง"));
  assert.ok(!thesaurus.suggest("รับใบรับฝาก").some(({ word }) => word === "รับหมายเลขตรวจสอบสถานะสิ่งส่ง"));
});

test("system entry, sorting, origin departure, transit, and destination arrival remain distinct parcel statuses", () => {
  assert.ok(!thesaurus.suggest("พัสดุเข้าระบบ").some(({ word }) => word === "จำแนกสิ่งส่งตามเส้นทางขนส่ง"));
  assert.ok(!thesaurus.suggest("ส่งพัสดุออกจากต้นทาง").some(({ word }) => word === "สิ่งส่งอยู่ในกระบวนการขนส่ง"));
  assert.ok(!thesaurus.suggest("พัสดุอยู่ระหว่างขนส่ง").some(({ word }) => word === "สิ่งส่งมาถึงศูนย์คัดแยกปลายทาง"));
});

test("out-for-delivery, recipient contact, scheduling, home delivery, and signature remain distinct", () => {
  assert.ok(!thesaurus.suggest("นำพัสดุออกนำจ่าย").some(({ word }) => word === "ติดต่อผู้รับก่อนนำจ่าย"));
  assert.ok(!thesaurus.suggest("นัดเวลาส่งพัสดุ").some(({ word }) => word === "นำจ่ายสิ่งส่งถึงที่อยู่ผู้รับ"));
  assert.ok(!thesaurus.suggest("ส่งพัสดุถึงบ้าน").some(({ word }) => word === "ลงลายมือชื่อยืนยันการรับสิ่งส่ง"));
});

test("cash collection, refusal, failed delivery, redelivery, and neighbor handoff remain distinct", () => {
  assert.ok(!thesaurus.suggest("เก็บเงินปลายทาง").some(({ word }) => word === "แจ้งปฏิเสธการรับสิ่งส่ง"));
  assert.ok(!thesaurus.suggest("ส่งพัสดุไม่สำเร็จ").some(({ word }) => word === "ดำเนินการนำจ่ายสิ่งส่งซ้ำ"));
  assert.ok(!thesaurus.suggest("นำจ่ายพัสดุใหม่").some(({ word }) => word === "ส่งมอบสิ่งส่งแก่ผู้รับแทนข้างเคียง"));
});

test("return-to-sender, loss, damage, claim, and postage refund remain distinct", () => {
  assert.ok(!thesaurus.suggest("พัสดุตีกลับ").some(({ word }) => word === "นำจ่ายคืนแก่ผู้ฝากส่ง"));
  assert.ok(!thesaurus.suggest("แจ้งพัสดุสูญหาย").some(({ word }) => word === "ยื่นเรื่องสิ่งส่งชำรุดเสียหาย"));
  assert.ok(!thesaurus.suggest("เคลมพัสดุ").some(({ word }) => word === "ยื่นคำขอคืนค่าบริการขนส่ง"));
});

test("opening a parcel and inspecting its contents remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดกล่องพัสดุ").some(({ word }) => word === "ตรวจสอบสิ่งของภายในบรรจุภัณฑ์"));
});

test("parcel alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("รับเลขติดตามพัสดุ").find(({ word }) => word === "รับเลขแทร็ก")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ติดตามพัสดุ").find(({ word }) => word === "เช็กของถึงไหน")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เคลมพัสดุ").find(({ word }) => word === "เรียกร้องค่าสินไหมสำหรับสิ่งส่ง")?.register, "ทางการ");
});

test("postal and parcel entries preserve verb POS", () => {
  for (const word of ["เลือกกล่องพัสดุ", "พับกล่องพัสดุ", "ห่อพัสดุ", "ใส่วัสดุกันกระแทก", "ปิดกล่องพัสดุ", "ชั่งพัสดุ", "วัดขนาดกล่อง", "เขียนที่อยู่ผู้รับ", "ติดฉลากพัสดุ", "เลือกบริการจัดส่ง", "คำนวณค่าส่ง", "ชำระค่าส่ง", "ฝากส่งพัสดุ", "รับใบรับฝาก", "รับเลขติดตามพัสดุ", "ติดตามพัสดุ", "พัสดุเข้าระบบ", "คัดแยกพัสดุ", "ส่งพัสดุออกจากต้นทาง", "พัสดุอยู่ระหว่างขนส่ง", "พัสดุถึงศูนย์ปลายทาง", "นำพัสดุออกนำจ่าย", "โทรหาผู้รับพัสดุ", "นัดเวลาส่งพัสดุ", "ส่งพัสดุถึงบ้าน", "เซ็นรับพัสดุ", "ถ่ายรูปยืนยันการส่ง", "เก็บเงินปลายทาง", "ปฏิเสธรับพัสดุ", "ส่งพัสดุไม่สำเร็จ", "นำจ่ายพัสดุใหม่", "ฝากพัสดุกับเพื่อนบ้าน", "พัสดุตีกลับ", "ส่งคืนผู้ส่ง", "แจ้งพัสดุสูญหาย", "แจ้งพัสดุเสียหาย", "เคลมพัสดุ", "ขอคืนค่าส่ง", "เปิดกล่องพัสดุ", "ตรวจของในกล่อง"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("showtime search, trailer viewing, synopsis reading, and showtime selection remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้นหารอบภาพยนตร์").some(({ word }) => word === "รับชมภาพยนตร์ตัวอย่าง"));
  assert.ok(!thesaurus.suggest("อ่านเรื่องย่อภาพยนตร์").some(({ word }) => word === "เลือกรอบเวลาฉายภาพยนตร์"));
});

test("ticket booking, seat selection, payment, receipt, and cancellation remain distinct", () => {
  assert.ok(!thesaurus.suggest("จองตั๋วภาพยนตร์").some(({ word }) => word === "ระบุที่นั่งในโรงภาพยนตร์"));
  assert.ok(!thesaurus.suggest("ชำระค่าตั๋วภาพยนตร์").some(({ word }) => word === "รับบัตรเข้าชมภาพยนตร์"));
  assert.ok(!thesaurus.suggest("รับตั๋วภาพยนตร์").some(({ word }) => word === "ยกเลิกรายการบัตรชมภาพยนตร์"));
});

test("queue receipt, concessions purchase, and concession pickup remain distinct", () => {
  assert.ok(!thesaurus.suggest("รับบัตรคิวหน้าโรง").some(({ word }) => word === "สั่งซื้อข้าวโพดคั่วหน้าโรง"));
  assert.ok(!thesaurus.suggest("ซื้อเครื่องดื่มหน้าโรง").some(({ word }) => word === "รับมอบอาหารและเครื่องดื่ม"));
});

test("waiting, ticket checking, scanning, entering, and finding a seat remain distinct", () => {
  assert.ok(!thesaurus.suggest("รอรอบฉาย").some(({ word }) => word === "ตรวจบัตรเข้าชมก่อนเข้าสู่โรงฉาย"));
  assert.ok(!thesaurus.suggest("ตรวจตั๋วหน้าโรง").some(({ word }) => word === "ตรวจรหัสบัตรเข้าชมด้วยเครื่องอ่าน"));
  assert.ok(!thesaurus.suggest("เดินเข้าห้องฉาย").some(({ word }) => word === "ค้นหาที่นั่งตามหมายเลขบัตร"));
});

test("advertisements, theatrical trailers, film start, and film viewing remain distinct", () => {
  assert.ok(!thesaurus.suggest("ดูโฆษณาก่อนภาพยนตร์").some(({ word }) => word === "รับชมภาพยนตร์ตัวอย่างก่อนเรื่องหลัก"));
  assert.ok(!thesaurus.suggest("ภาพยนตร์เริ่มฉาย").some(({ word }) => word === "ชมภาพยนตร์"));
});

test("whispering, laughing, crying, restroom exit, and seat return remain distinct", () => {
  assert.ok(!thesaurus.suggest("กระซิบระหว่างดูหนัง").some(({ word }) => word === "หัวเราะระหว่างรับชมภาพยนตร์"));
  assert.ok(!thesaurus.suggest("ร้องไห้กับภาพยนตร์").some(({ word }) => word === "ออกจากที่นั่งชั่วคราวระหว่างการฉาย"));
  assert.ok(!thesaurus.suggest("ลุกไปห้องน้ำระหว่างฉาย").some(({ word }) => word === "กลับเข้าประจำที่นั่งในโรงฉาย"));
});

test("picture interruption, sound failure, staff report, and resumed screening remain distinct", () => {
  assert.ok(!thesaurus.suggest("ภาพยนตร์สะดุด").some(({ word }) => word === "ระบบเสียงในโรงภาพยนตร์ขัดข้อง"));
  assert.ok(!thesaurus.suggest("แจ้งพนักงานโรงภาพยนตร์").some(({ word }) => word === "ดำเนินการฉายภาพยนตร์ต่อ"));
});

test("film ending, credits, leaving the seat, collecting trash, and exiting remain distinct", () => {
  assert.ok(!thesaurus.suggest("ภาพยนตร์จบ").some(({ word }) => word === "รับชมรายนามผู้สร้างหลังภาพยนตร์จบ"));
  assert.ok(!thesaurus.suggest("ลุกออกจากที่นั่งในโรง").some(({ word }) => word === "รวบรวมขยะออกจากบริเวณที่นั่ง"));
  assert.ok(!thesaurus.suggest("เก็บขยะหลังดูหนัง").some(({ word }) => word === "ออกจากโรงฉายหลังภาพยนตร์จบ"));
});

test("cinema alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("ดูตัวอย่างภาพยนตร์ออนไลน์").find(({ word }) => word === "ดูเทรลเลอร์")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("ร้องไห้กับภาพยนตร์").find(({ word }) => word === "หลั่งน้ำตาระหว่างรับชมภาพยนตร์")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("รีวิวภาพยนตร์").find(({ word }) => word === "วิจารณ์ภาพยนตร์หลังรับชม")?.register, "ทางการ");
});

test("cinema and film-viewing entries preserve verb POS", () => {
  for (const word of ["ค้นหารอบภาพยนตร์", "ดูตัวอย่างภาพยนตร์ออนไลน์", "อ่านเรื่องย่อภาพยนตร์", "เลือกรอบฉาย", "จองตั๋วภาพยนตร์", "เลือกที่นั่งในโรง", "ชำระค่าตั๋วภาพยนตร์", "รับตั๋วภาพยนตร์", "ยกเลิกตั๋วภาพยนตร์", "เดินทางถึงโรงภาพยนตร์", "รับบัตรคิวหน้าโรง", "ซื้อป๊อปคอร์น", "ซื้อเครื่องดื่มหน้าโรง", "รับของกินหน้าโรง", "รอรอบฉาย", "ตรวจตั๋วหน้าโรง", "สแกนตั๋วเข้าโรง", "เดินเข้าห้องฉาย", "หาที่นั่งในโรง", "นั่งประจำที่ในโรง", "ปิดเสียงโทรศัพท์ในโรง", "ดูโฆษณาก่อนภาพยนตร์", "ดูตัวอย่างหนังก่อนฉาย", "ภาพยนตร์เริ่มฉาย", "รับชมภาพยนตร์", "กระซิบระหว่างดูหนัง", "หัวเราะในโรงภาพยนตร์", "ร้องไห้กับภาพยนตร์", "ลุกไปห้องน้ำระหว่างฉาย", "กลับเข้าที่นั่งในโรง", "ภาพยนตร์สะดุด", "เสียงในโรงดับ", "แจ้งพนักงานโรงภาพยนตร์", "ภาพยนตร์ฉายต่อ", "ภาพยนตร์จบ", "ดูเครดิตท้ายเรื่อง", "ลุกออกจากที่นั่งในโรง", "เก็บขยะหลังดูหนัง", "เดินออกจากโรงภาพยนตร์", "รีวิวภาพยนตร์"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("concert search, seating chart, fan membership, presale, and ticket purchase remain distinct", () => {
  assert.ok(!thesaurus.suggest("ค้นหางานคอนเสิร์ต").some(({ word }) => word === "ตรวจสอบแผนผังพื้นที่จัดแสดง"));
  assert.ok(!thesaurus.suggest("สมัครสมาชิกแฟนคลับ").some(({ word }) => word === "ได้รับสิทธิจองบัตรล่วงหน้า"));
  assert.ok(!thesaurus.suggest("รับสิทธิพรีเซล").some(({ word }) => word === "ทำรายการซื้อบัตรเข้าชมการแสดง"));
});

test("zone choice, ticket payment, receipt, transfer, and resale remain distinct", () => {
  assert.ok(!thesaurus.suggest("เลือกโซนคอนเสิร์ต").some(({ word }) => word === "ชำระค่าบัตรเข้าชมการแสดง"));
  assert.ok(!thesaurus.suggest("รับบัตรคอนเสิร์ต").some(({ word }) => word === "โอนสิทธิการเข้าชมให้บุคคลอื่น"));
  assert.ok(!thesaurus.suggest("โอนบัตรให้เพื่อน").some(({ word }) => word === "จำหน่ายต่อบัตรเข้าชมการแสดง"));
});

test("venue arrival, queueing, ticket check, wristband exchange, and baggage screening remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินทางถึงสถานที่จัดคอนเสิร์ต").some(({ word }) => word === "เข้าคิวผ่านเข้าสถานที่จัดการแสดง"));
  assert.ok(!thesaurus.suggest("ตรวจบัตรหน้างาน").some(({ word }) => word === "แลกรับสายรัดข้อมือยืนยันสิทธิ"));
  assert.ok(!thesaurus.suggest("แลกสายรัดข้อมือ").some(({ word }) => word === "ผ่านการตรวจสิ่งของก่อนเข้าสถานที่"));
});

test("bag deposit, merchandise purchase, light-stick purchase, seat search, and standing area remain distinct", () => {
  assert.ok(!thesaurus.suggest("ฝากของหน้างาน").some(({ word }) => word === "ซื้อสินค้าที่ระลึกจากการแสดง"));
  assert.ok(!thesaurus.suggest("ซื้อของที่ระลึกคอนเสิร์ต").some(({ word }) => word === "ซื้ออุปกรณ์ให้แสงสำหรับเชียร์"));
  assert.ok(!thesaurus.suggest("หาที่นั่งในฮอลล์").some(({ word }) => word === "เข้าประจำพื้นที่ยืนด้านหน้าเวที"));
});

test("artist waiting, show opening, and artist entrance remain distinct", () => {
  assert.ok(!thesaurus.suggest("รอศิลปินขึ้นเวที").some(({ word }) => word === "เริ่มต้นการแสดงดนตรีสด"));
  assert.ok(!thesaurus.suggest("เปิดการแสดงคอนเสิร์ต").some(({ word }) => word === "ศิลปินปรากฏตัวบนเวที"));
});

test("cheering, singing along, waving lights, filming, jumping, and dancing remain distinct", () => {
  assert.ok(!thesaurus.suggest("ส่งเสียงเชียร์").some(({ word }) => word === "ขับร้องตามบทเพลงที่แสดง"));
  assert.ok(!thesaurus.suggest("โบกแท่งไฟ").some(({ word }) => word === "บันทึกภาพเคลื่อนไหวระหว่างการแสดง"));
  assert.ok(!thesaurus.suggest("กระโดดตามจังหวะ").some(({ word }) => word === "เคลื่อนไหวร่างกายตามจังหวะดนตรี"));
});

test("slow song, final song, encore request, encore return, and show closing remain distinct", () => {
  assert.ok(!thesaurus.suggest("เล่นเพลงช้า").some(({ word }) => word === "บรรเลงบทเพลงสุดท้ายของการแสดง"));
  assert.ok(!thesaurus.suggest("เล่นเพลงสุดท้าย").some(({ word }) => word === "เรียกร้องให้ศิลปินกลับมาแสดงเพิ่มเติม"));
  assert.ok(!thesaurus.suggest("ศิลปินกลับขึ้นเวที").some(({ word }) => word === "ยุติการแสดงดนตรีสด"));
});

test("audience bow, hall exit, post-show merchandise, and review remain distinct", () => {
  assert.ok(!thesaurus.suggest("โค้งขอบคุณผู้ชม").some(({ word }) => word === "ออกจากสถานที่จัดการแสดง"));
  assert.ok(!thesaurus.suggest("ซื้อสินค้าหลังงาน").some(({ word }) => word === "วิจารณ์การแสดงดนตรีสดหลังเข้าชม"));
});

test("concert alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("กดบัตรคอนเสิร์ต").find(({ word }) => word === "แย่งซื้อบัตร")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เล่นเพลงช้า").find(({ word }) => word === "บรรเลงบทเพลงจังหวะช้า")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("รีวิวคอนเสิร์ต").find(({ word }) => word === "วิจารณ์การแสดงดนตรีสดหลังเข้าชม")?.register, "ทางการ");
});

test("concert and live-performance entries preserve verb POS", () => {
  for (const word of ["ค้นหางานคอนเสิร์ต", "ดูผังที่นั่งคอนเสิร์ต", "สมัครสมาชิกแฟนคลับ", "รับสิทธิพรีเซล", "กดบัตรคอนเสิร์ต", "เลือกโซนคอนเสิร์ต", "ชำระค่าบัตรคอนเสิร์ต", "รับบัตรคอนเสิร์ต", "โอนบัตรให้เพื่อน", "ขายต่อบัตรคอนเสิร์ต", "เดินทางถึงสถานที่จัดคอนเสิร์ต", "ต่อแถวเข้างานคอนเสิร์ต", "ตรวจบัตรหน้างาน", "แลกสายรัดข้อมือ", "ผ่านจุดตรวจสัมภาระ", "ฝากของหน้างาน", "ซื้อของที่ระลึกคอนเสิร์ต", "ซื้อแท่งไฟ", "หาที่นั่งในฮอลล์", "ยืนหน้าเวที", "รอศิลปินขึ้นเวที", "เปิดการแสดงคอนเสิร์ต", "ศิลปินขึ้นเวที", "ส่งเสียงเชียร์", "ร้องตามเพลง", "โบกแท่งไฟ", "ถ่ายวิดีโอคอนเสิร์ต", "กระโดดตามจังหวะ", "เต้นตามเพลง", "ศิลปินพูดคุยกับแฟนเพลง", "เปลี่ยนชุดบนเวที", "เล่นเพลงช้า", "เล่นเพลงสุดท้าย", "ขอเพลงอังกอร์", "ศิลปินกลับขึ้นเวที", "ปิดการแสดงคอนเสิร์ต", "โค้งขอบคุณผู้ชม", "เดินออกจากฮอลล์", "ซื้อสินค้าหลังงาน", "รีวิวคอนเสิร์ต"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("script reading, distribution, casting, audition, and role assignment remain distinct", () => {
  assert.ok(!thesaurus.suggest("อ่านบทละคร").some(({ word }) => word === "ส่งมอบบทการแสดงแก่ผู้แสดง"));
  assert.ok(!thesaurus.suggest("คัดเลือกนักแสดง").some(({ word }) => word === "ทดสอบความเหมาะสมกับบทบาท"));
  assert.ok(!thesaurus.suggest("ทดลองแสดงบท").some(({ word }) => word === "ได้รับมอบหมายให้แสดงบทบาท"));
});

test("memorization, character interpretation, read-through, blocking rehearsal, and dress rehearsal remain distinct", () => {
  assert.ok(!thesaurus.suggest("ท่องบทละคร").some(({ word }) => word === "วิเคราะห์แรงจูงใจของบทบาท"));
  assert.ok(!thesaurus.suggest("ซ้อมอ่านบท").some(({ word }) => word === "ซักซ้อมลำดับการปรากฏตัวในฉาก"));
  assert.ok(!thesaurus.suggest("ซ้อมการเคลื่อนไหว").some(({ word }) => word === "ซักซ้อมเสมือนการแสดงจริง"));
});

test("direction, cueing, set arrangement, set change, lighting, and sound check remain distinct", () => {
  assert.ok(!thesaurus.suggest("กำกับการแสดง").some(({ word }) => word === "แจ้งสัญญาณเริ่มการแสดงแก่ผู้แสดง"));
  assert.ok(!thesaurus.suggest("จัดฉากเวที").some(({ word }) => word === "ปรับเปลี่ยนฉากระหว่างการแสดง"));
  assert.ok(!thesaurus.suggest("ติดตั้งไฟเวที").some(({ word }) => word === "ตรวจสอบระบบเสียงก่อนการแสดง"));
});

test("props, makeup, costume, backstage waiting, and places call remain distinct preparations", () => {
  assert.ok(!thesaurus.suggest("เตรียมอุปกรณ์ประกอบฉาก").some(({ word }) => word === "แต่งหน้าให้เหมาะกับบทบาท"));
  assert.ok(!thesaurus.suggest("สวมเครื่องแต่งกายละคร").some(({ word }) => word === "รอเข้าฉากในพื้นที่หลังเวที"));
  assert.ok(!thesaurus.suggest("รอหลังเวที").some(({ word }) => word === "แจ้งผู้แสดงให้เข้าตำแหน่งก่อนเปิดฉาก"));
});

test("curtain opening, entrance, line delivery, emotion, movement, and dialogue exchange remain distinct", () => {
  assert.ok(!thesaurus.suggest("เปิดม่านการแสดง").some(({ word }) => word === "ปรากฏตัวบนเวทีตามคิว"));
  assert.ok(!thesaurus.suggest("กล่าวบทละคร").some(({ word }) => word === "ถ่ายทอดอารมณ์ของตัวละคร"));
  assert.ok(!thesaurus.suggest("เคลื่อนไหวบนเวที").some(({ word }) => word === "ตอบสนองถ้อยคำระหว่างผู้แสดง"));
});

test("forgetting, improvising, exiting, and changing costume remain distinct", () => {
  assert.ok(!thesaurus.suggest("ลืมบท").some(({ word }) => word === "สร้างถ้อยคำขึ้นเฉพาะหน้าระหว่างแสดง"));
  assert.ok(!thesaurus.suggest("ออกจากฉาก").some(({ word }) => word === "ผลัดเครื่องแต่งกายระหว่างการแสดง"));
});

test("intermission, next act, curtain close, bow, applause, and audience greeting remain distinct", () => {
  assert.ok(!thesaurus.suggest("พักครึ่งการแสดง").some(({ word }) => word === "เปิดการแสดงในองก์ถัดไป"));
  assert.ok(!thesaurus.suggest("เริ่มองก์ถัดไป").some(({ word }) => word === "สิ้นสุดการแสดงบนเวที"));
  assert.ok(!thesaurus.suggest("โค้งคำนับผู้ชม").some(({ word }) => word === "รับการชื่นชมจากผู้ชม"));
  assert.ok(!thesaurus.suggest("รับเสียงปรบมือ").some(({ word }) => word === "ปรากฏตัวต่อผู้ชมหลังการแสดง"));
});

test("set strike and theatre review remain distinct post-show actions", () => {
  assert.ok(!thesaurus.suggest("เก็บฉากเวที").some(({ word }) => word === "ประเมินคุณค่าการแสดงละครเวที"));
});

test("theatre alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("คัดเลือกนักแสดง").find(({ word }) => word === "แคสต์นักแสดง")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เปิดม่านการแสดง").find(({ word }) => word === "ชักม่านเปิดเวที")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("วิจารณ์ละครเวที").find(({ word }) => word === "ประเมินคุณค่าการแสดงละครเวที")?.register, "ทางการ");
});

test("theatre rehearsal and performance entries preserve verb POS", () => {
  for (const word of ["อ่านบทละคร", "แจกบทละคร", "คัดเลือกนักแสดง", "ทดลองแสดงบท", "รับบทตัวละคร", "ท่องบทละคร", "ตีความตัวละคร", "ซ้อมอ่านบท", "ซ้อมเข้าฉาก", "ซ้อมการเคลื่อนไหว", "ซ้อมใหญ่", "กำกับการแสดง", "ให้คิวนักแสดง", "จัดฉากเวที", "เปลี่ยนฉากเวที", "ติดตั้งไฟเวที", "ทดสอบเสียงเวที", "เตรียมอุปกรณ์ประกอบฉาก", "แต่งหน้านักแสดง", "สวมเครื่องแต่งกายละคร", "รอหลังเวที", "เรียกนักแสดงเข้าประจำที่", "เปิดม่านการแสดง", "เข้าฉาก", "กล่าวบทละคร", "แสดงอารมณ์ตามบท", "เคลื่อนไหวบนเวที", "รับส่งบท", "ลืมบท", "ด้นบท", "ออกจากฉาก", "เปลี่ยนเครื่องแต่งกายหลังเวที", "พักครึ่งการแสดง", "เริ่มองก์ถัดไป", "ปิดม่านการแสดง", "โค้งคำนับผู้ชม", "รับเสียงปรบมือ", "ออกมาพบผู้ชม", "เก็บฉากเวที", "วิจารณ์ละครเวที"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("camera preparation, battery insertion, memory-card insertion, lens change, and lens cleaning remain distinct", () => {
  assert.ok(!thesaurus.suggest("เตรียมกล้องถ่ายภาพ").some(({ word }) => word === "ติดตั้งแบตเตอรี่ในกล้องถ่ายภาพ"));
  assert.ok(!thesaurus.suggest("ใส่การ์ดหน่วยความจำ").some(({ word }) => word === "ถอดเปลี่ยนเลนส์ถ่ายภาพ"));
  assert.ok(!thesaurus.suggest("เปลี่ยนเลนส์กล้อง").some(({ word }) => word === "ทำความสะอาดชิ้นเลนส์ด้านหน้า"));
});

test("tripod attachment, camera placement, and shooting-mode selection remain distinct", () => {
  assert.ok(!thesaurus.suggest("ติดขาตั้งกล้อง").some(({ word }) => word === "จัดวางกล้องในตำแหน่งถ่ายภาพ"));
  assert.ok(!thesaurus.suggest("ตั้งกล้องถ่ายภาพ").some(({ word }) => word === "กำหนดรูปแบบการบันทึกภาพ"));
});

test("aperture, shutter speed, ISO, metering, and white balance remain distinct settings", () => {
  assert.ok(!thesaurus.suggest("ปรับรูรับแสง").some(({ word }) => word === "กำหนดระยะเวลาเปิดรับแสง"));
  assert.ok(!thesaurus.suggest("ปรับความเร็วชัตเตอร์").some(({ word }) => word === "กำหนดค่าความไวต่อแสง"));
  assert.ok(!thesaurus.suggest("วัดแสงถ่ายภาพ").some(({ word }) => word === "ปรับสมดุลสีตามอุณหภูมิแสง"));
});

test("lighting arrangement, studio lights, flash attachment, angle, and composition remain distinct", () => {
  assert.ok(!thesaurus.suggest("จัดแสงถ่ายภาพ").some(({ word }) => word === "เปิดใช้งานชุดไฟสำหรับการถ่ายภาพ"));
  assert.ok(!thesaurus.suggest("ติดแฟลชกล้อง").some(({ word }) => word === "กำหนดมุมมองของกล้อง"));
  assert.ok(!thesaurus.suggest("ปรับมุมกล้อง").some(({ word }) => word === "วางองค์ประกอบภายในกรอบภาพ"));
});

test("focus acquisition, focus lock, posing, direction, gaze, and smile remain distinct", () => {
  assert.ok(!thesaurus.suggest("หาโฟกัส").some(({ word }) => word === "ตรึงระยะชัดไว้ที่ตำแหน่งเดิม"));
  assert.ok(!thesaurus.suggest("โพสท่าถ่ายรูป").some(({ word }) => word === "แนะนำผู้เป็นแบบให้ปรับท่าทาง"));
  assert.ok(!thesaurus.suggest("มองกล้องถ่ายภาพ").some(({ word }) => word === "แสดงรอยยิ้มต่อหน้ากล้อง"));
});

test("single capture, burst, flash, review, zoom inspection, and retake remain distinct", () => {
  assert.ok(!thesaurus.suggest("กดชัตเตอร์").some(({ word }) => word === "บันทึกภาพหลายเฟรมต่อเนื่อง"));
  assert.ok(!thesaurus.suggest("ใช้แฟลชถ่ายภาพ").some(({ word }) => word === "ตรวจสอบภาพที่บันทึกแล้ว"));
  assert.ok(!thesaurus.suggest("ซูมดูภาพ").some(({ word }) => word === "บันทึกภาพซ้ำอีกครั้ง"));
});

test("backup, transfer, selection, exposure, color, crop, and retouch remain distinct post-production steps", () => {
  assert.ok(!thesaurus.suggest("สำรองไฟล์ภาพ").some(({ word }) => word === "ถ่ายโอนไฟล์ภาพไปยังอุปกรณ์อื่น"));
  assert.ok(!thesaurus.suggest("คัดเลือกรูปภาพ").some(({ word }) => word === "ปรับค่าความสว่างและความเปรียบต่าง"));
  assert.ok(!thesaurus.suggest("ปรับสีภาพ").some(({ word }) => word === "ตัดส่วนเกินออกจากกรอบภาพ"));
  assert.ok(!thesaurus.suggest("ครอปภาพ").some(({ word }) => word === "ปรับแก้ตำหนิและรายละเอียดในภาพ"));
});

test("watermarking, client delivery, and uploading remain distinct distribution steps", () => {
  assert.ok(!thesaurus.suggest("ใส่ลายน้ำภาพ").some(({ word }) => word === "ส่งมอบไฟล์ภาพแก่ผู้ว่าจ้าง"));
  assert.ok(!thesaurus.suggest("ส่งรูปให้ลูกค้า").some(({ word }) => word === "นำไฟล์ภาพเข้าสู่ระบบออนไลน์"));
});

test("photography alternatives retain colloquial, formal, and literary registers", () => {
  assert.equal(thesaurus.suggest("ปรับค่าความไวแสง").find(({ word }) => word === "ปรับไอเอสโอ")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("มองกล้องถ่ายภาพ").find(({ word }) => word === "หันสายตาไปยังเลนส์กล้อง")?.register, "วรรณกรรม");
  assert.equal(thesaurus.suggest("รีทัชภาพ").find(({ word }) => word === "ปรับแก้ตำหนิและรายละเอียดในภาพ")?.register, "ทางการ");
});

test("photography and image-editing entries preserve verb POS", () => {
  for (const word of ["เตรียมกล้องถ่ายภาพ", "ใส่แบตเตอรี่กล้อง", "ใส่การ์ดหน่วยความจำ", "เปลี่ยนเลนส์กล้อง", "เช็ดเลนส์กล้อง", "ติดขาตั้งกล้อง", "ตั้งกล้องถ่ายภาพ", "เลือกโหมดถ่ายภาพ", "ปรับรูรับแสง", "ปรับความเร็วชัตเตอร์", "ปรับค่าความไวแสง", "วัดแสงถ่ายภาพ", "ตั้งสมดุลแสงขาว", "จัดแสงถ่ายภาพ", "เปิดไฟสตูดิโอ", "ติดแฟลชกล้อง", "ปรับมุมกล้อง", "จัดองค์ประกอบภาพ", "หาโฟกัส", "ล็อกโฟกัส", "โพสท่าถ่ายรูป", "บอกแบบเปลี่ยนท่า", "มองกล้องถ่ายภาพ", "ยิ้มให้กล้อง", "กดชัตเตอร์", "ถ่ายภาพต่อเนื่อง", "ใช้แฟลชถ่ายภาพ", "ตรวจภาพหลังถ่าย", "ซูมดูภาพ", "ถ่ายภาพใหม่", "สำรองไฟล์ภาพ", "โอนไฟล์จากกล้อง", "คัดเลือกรูปภาพ", "ปรับแสงภาพ", "ปรับสีภาพ", "ครอปภาพ", "รีทัชภาพ", "ใส่ลายน้ำภาพ", "ส่งรูปให้ลูกค้า", "อัปโหลดภาพ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("storyboard, production planning, script writing, scheduling, location selection, and permission remain distinct", () => {
  assert.ok(!thesaurus.suggest("เขียนสตอรีบอร์ด").some(({ word }) => word === "กำหนดแนวทางการผลิตวีดิทัศน์"));
  assert.ok(!thesaurus.suggest("เขียนบทวิดีโอ").some(({ word }) => word === "กำหนดตารางการถ่ายทำ"));
  assert.ok(!thesaurus.suggest("เลือกสถานที่ถ่ายทำ").some(({ word }) => word === "ยื่นขออนุญาตใช้พื้นที่ถ่ายทำ"));
});

test("camera preparation, microphone attachment, microphone test, and recording level remain distinct", () => {
  assert.ok(!thesaurus.suggest("เตรียมกล้องวิดีโอ").some(({ word }) => word === "ติดตั้งอุปกรณ์รับเสียง"));
  assert.ok(!thesaurus.suggest("ทดสอบไมโครโฟน").some(({ word }) => word === "กำหนดระดับสัญญาณเสียงขาเข้า"));
});

test("video lighting, framing, rehearsal, action cue, and recording start remain distinct", () => {
  assert.ok(!thesaurus.suggest("จัดไฟถ่ายวิดีโอ").some(({ word }) => word === "กำหนดองค์ประกอบภายในกรอบภาพเคลื่อนไหว"));
  assert.ok(!thesaurus.suggest("ซ้อมหน้ากล้อง").some(({ word }) => word === "ให้สัญญาณเริ่มการบันทึกภาพ"));
  assert.ok(!thesaurus.suggest("ให้สัญญาณเริ่มถ่าย").some(({ word }) => word === "เริ่มบันทึกภาพเคลื่อนไหว"));
});

test("acting, presenting, panning, tilting, zooming, and tracking remain distinct camera actions", () => {
  assert.ok(!thesaurus.suggest("แสดงหน้ากล้อง").some(({ word }) => word === "กล่าวเนื้อหาต่อหน้ากล้อง"));
  assert.ok(!thesaurus.suggest("แพนกล้อง").some(({ word }) => word === "กวาดมุมกล้องในแนวดิ่ง"));
  assert.ok(!thesaurus.suggest("ซูมกล้อง").some(({ word }) => word === "เคลื่อนกล้องติดตามบุคคลในภาพ"));
});

test("recording stop, retake, footage review, backup, and import remain distinct", () => {
  assert.ok(!thesaurus.suggest("หยุดบันทึกวิดีโอ").some(({ word }) => word === "บันทึกฉากเดิมซ้ำอีกครั้ง"));
  assert.ok(!thesaurus.suggest("ตรวจฟุตเทจ").some(({ word }) => word === "จัดทำสำเนาสำรองของไฟล์ต้นฉบับ"));
  assert.ok(!thesaurus.suggest("สำรองฟุตเทจ").some(({ word }) => word === "นำไฟล์ภาพเคลื่อนไหวเข้าสู่โปรแกรม"));
});

test("timeline arrangement, cutting, joining, and transitions remain distinct editing steps", () => {
  assert.ok(!thesaurus.suggest("เรียงคลิปบนไทม์ไลน์").some(({ word }) => word === "ตัดแบ่งช่วงของภาพเคลื่อนไหว"));
  assert.ok(!thesaurus.suggest("ตัดคลิปวิดีโอ").some(({ word }) => word === "เชื่อมลำดับภาพเคลื่อนไหว"));
  assert.ok(!thesaurus.suggest("ต่อคลิปวิดีโอ").some(({ word }) => word === "เพิ่มการเปลี่ยนผ่านระหว่างคลิป"));
});

test("color grading, noise reduction, mixing, narration, music, and subtitles remain distinct", () => {
  assert.ok(!thesaurus.suggest("ปรับสีวิดีโอ").some(({ word }) => word === "ลดสัญญาณเสียงรบกวนในไฟล์"));
  assert.ok(!thesaurus.suggest("ผสมเสียงวิดีโอ").some(({ word }) => word === "บันทึกเสียงบรรยายประกอบภาพ"));
  assert.ok(!thesaurus.suggest("ใส่ดนตรีประกอบ").some(({ word }) => word === "เพิ่มข้อความบรรยายใต้ภาพ"));
});

test("subtitle review, rendering, file delivery, and publishing remain distinct", () => {
  assert.ok(!thesaurus.suggest("ตรวจคำบรรยายวิดีโอ").some(({ word }) => word === "ประมวลผลและส่งออกไฟล์วีดิทัศน์"));
  assert.ok(!thesaurus.suggest("เรนเดอร์วิดีโอ").some(({ word }) => word === "ส่งมอบไฟล์วีดิทัศน์แก่ผู้รับ"));
  assert.ok(!thesaurus.suggest("ส่งไฟล์วิดีโอ").some(({ word }) => word === "เผยแพร่สื่อภาพเคลื่อนไหวสู่สาธารณะ"));
});

test("video-production alternatives retain colloquial and formal registers", () => {
  assert.equal(thesaurus.suggest("เลือกสถานที่ถ่ายทำ").find(({ word }) => word === "หาโลเคชัน")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เรนเดอร์วิดีโอ").find(({ word }) => word === "เอ็กซ์พอร์ตคลิป")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("เผยแพร่วิดีโอ").find(({ word }) => word === "เผยแพร่สื่อภาพเคลื่อนไหวสู่สาธารณะ")?.register, "ทางการ");
});

test("video production and editing entries preserve verb POS", () => {
  for (const word of ["เขียนสตอรีบอร์ด", "วางแผนถ่ายทำ", "เขียนบทวิดีโอ", "จัดตารางถ่ายทำ", "เลือกสถานที่ถ่ายทำ", "ขออนุญาตถ่ายทำ", "เตรียมกล้องวิดีโอ", "ติดไมโครโฟน", "ทดสอบไมโครโฟน", "ตั้งระดับเสียงบันทึก", "จัดไฟถ่ายวิดีโอ", "ตั้งเฟรมวิดีโอ", "ซ้อมหน้ากล้อง", "ให้สัญญาณเริ่มถ่าย", "เริ่มบันทึกวิดีโอ", "แสดงหน้ากล้อง", "พูดหน้ากล้อง", "แพนกล้อง", "เอียงกล้องขึ้นลง", "ซูมกล้อง", "ติดตามตัวแบบด้วยกล้อง", "หยุดบันทึกวิดีโอ", "ถ่ายวิดีโอซ้ำ", "ตรวจฟุตเทจ", "สำรองฟุตเทจ", "นำเข้าไฟล์วิดีโอ", "เรียงคลิปบนไทม์ไลน์", "ตัดคลิปวิดีโอ", "ต่อคลิปวิดีโอ", "ใส่ทรานซิชัน", "ปรับสีวิดีโอ", "ลดเสียงรบกวน", "ผสมเสียงวิดีโอ", "พากย์เสียงวิดีโอ", "ใส่ดนตรีประกอบ", "ใส่คำบรรยายวิดีโอ", "ตรวจคำบรรยายวิดีโอ", "เรนเดอร์วิดีโอ", "ส่งไฟล์วิดีโอ", "เผยแพร่วิดีโอ"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});

test("alarm waking and snoozing remain distinct daily actions", () => {
  assert.ok(!thesaurus.suggest("ตื่นตามนาฬิกาปลุก").some(({ word }) => word === "กดเลื่อนปลุก"));
  assert.ok(!thesaurus.suggest("เลื่อนเวลาปลุก").some(({ word }) => word === "ลุกตื่นตามเวลาที่ตั้งไว้"));
});

test("bed making, curtain opening, and morning light remain distinct", () => {
  assert.ok(!thesaurus.suggest("จัดที่นอน").some(({ word }) => word === "รูดม่านเปิด"));
  assert.ok(!thesaurus.suggest("เปิดผ้าม่าน").some(({ word }) => word === "ออกไปรับแดดเช้า"));
});

test("buttoning, zipping, and wearing a watch remain distinct dressing actions", () => {
  assert.ok(!thesaurus.suggest("ติดกระดุมเสื้อ").some(({ word }) => word === "ปิดซิปกางเกง"));
  assert.ok(!thesaurus.suggest("รูดซิปกางเกง").some(({ word }) => word === "สวมนาฬิกา"));
});

test("packing, checking belongings, carrying keys, and leaving home remain distinct", () => {
  assert.ok(!thesaurus.suggest("จัดกระเป๋า").some(({ word }) => word === "ตรวจสอบสิ่งของจำเป็น"));
  assert.ok(!thesaurus.suggest("พกกุญแจบ้าน").some(({ word }) => word === "เดินออกจากบ้าน"));
  assert.ok(!thesaurus.suggest("ออกจากบ้าน").some(({ word }) => word === "ล็อกบ้าน"));
});

test("elevator, stairs, bus stop, and bus travel actions remain distinct", () => {
  assert.ok(!thesaurus.suggest("เรียกลิฟต์").some(({ word }) => word === "เดินลงบันได"));
  assert.ok(!thesaurus.suggest("เดินไปป้ายรถ").some(({ word }) => word === "รอรถเมล์"));
  assert.ok(!thesaurus.suggest("ขึ้นรถประจำทาง").some(({ word }) => word === "ลงรถเมล์"));
});

test("fare payment, seating, road crossing, and commuting remain distinct", () => {
  assert.ok(!thesaurus.suggest("แตะบัตรโดยสาร").some(({ word }) => word === "เลือกที่นั่งบนรถ"));
  assert.ok(!thesaurus.suggest("ข้ามถนน").some(({ word }) => word === "เดินทางไปยังที่ทำงาน"));
});

test("clocking in, computer startup, schedule review, and breaks remain distinct", () => {
  assert.ok(!thesaurus.suggest("ลงเวลาเข้างาน").some(({ word }) => word === "เปิดคอมทำงาน"));
  assert.ok(!thesaurus.suggest("ตรวจตารางงาน").some(({ word }) => word === "ผ่อนคลายสายตา"));
  assert.ok(!thesaurus.suggest("พักสายตา").some(({ word }) => word === "พักเที่ยง"));
});

test("restroom entry and flushing remain distinct", () => {
  assert.ok(!thesaurus.suggest("เข้าห้องน้ำ").some(({ word }) => word === "กดน้ำชักโครก"));
});

test("returning, entering home, removing shoes, and putting belongings away remain distinct", () => {
  assert.ok(!thesaurus.suggest("เดินทางกลับบ้าน").some(({ word }) => word === "ใช้กุญแจเปิดประตู"));
  assert.ok(!thesaurus.suggest("ไขประตูบ้าน").some(({ word }) => word === "ถอดรองเท้าหน้าบ้าน"));
  assert.ok(!thesaurus.suggest("วางกระเป๋า").some(({ word }) => word === "แขวนเครื่องแต่งกาย"));
});

test("daily routine alternatives retain registers and verb POS", () => {
  assert.equal(thesaurus.suggest("ตรวจของใช้").find(({ word }) => word === "เช็กของก่อนออก")?.register, "ภาษาพูด");
  assert.equal(thesaurus.suggest("หลับไป").find(({ word }) => word === "เข้าสู่นิทรา")?.register, "วรรณกรรม");
  for (const word of ["ตื่นตามนาฬิกาปลุก", "เลื่อนเวลาปลุก", "จัดที่นอน", "เปิดผ้าม่าน", "รับแสงยามเช้า", "ติดกระดุมเสื้อ", "รูดซิปกางเกง", "ใส่นาฬิกาข้อมือ", "จัดกระเป๋า", "ตรวจของใช้", "พกกุญแจบ้าน", "ออกจากบ้าน", "ล็อกประตูบ้าน", "เรียกลิฟต์", "ลงบันได", "เดินไปป้ายรถ", "รอรถประจำทาง", "ขึ้นรถประจำทาง", "แตะบัตรโดยสาร", "หาที่นั่งบนรถ", "ลงจากรถประจำทาง", "ข้ามถนน", "เดินทางไปทำงาน", "ลงเวลาเข้างาน", "เปิดคอมพิวเตอร์ทำงาน", "ตรวจตารางงาน", "พักสายตา", "พักกลางวัน", "เข้าห้องน้ำ", "กดชักโครก", "เดินทางกลับบ้าน", "ไขประตูบ้าน", "ถอดรองเท้าเข้าบ้าน", "วางกระเป๋า", "แขวนเสื้อผ้า", "ชาร์จโทรศัพท์", "เตรียมเสื้อผ้าสำหรับพรุ่งนี้", "ปิดผ้าม่าน", "ปิดไฟนอน", "หลับไป"]) {
    assert.ok(thesaurus.suggest(word).every(({ pos }) => pos.includes("ก.")), word);
  }
});
