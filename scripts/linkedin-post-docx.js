/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ZaiMem — LinkedIn launch post → docx (copywriting scene, Profile B, no cover)
 * Output: /home/z/my-project/download/zaimem-linkedin-post.docx
 */
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} = require("docx");
const fs = require("fs");

// Scene palette (scenes/copywriting.md §5)
const P = {
  primary: "1A1A1A",
  body: "333333",
  secondary: "666666",
  accent: "E85D3A",
};
const FONT = { ascii: "Calibri", eastAsia: "Microsoft YaHei" };

const t = (text, opts = {}) =>
  new TextRun({ text, font: FONT, size: 24, color: P.body, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 200, line: 400 },
    children,
    ...opts,
  });

// ── the post, line by line ──────────────────────────────────────────────
const POST_LINES = [
  { runs: [t("Every AI agent has amnesia. You close the chat — and everything it learned about you is gone.", { bold: true, color: P.primary })] },
  { runs: [t("We built ZaiMem to end that.")] },
  { runs: [
    t("ZaiMem is an "),
    t("open-source memory & context layer", { bold: true, color: P.primary }),
    t(" for chat.z.ai agents — an MCP server that gives any agent a persistent vector memory, an automatic context enhancer and a built-in token saver. One private token, one pasted prompt — the session syncs itself from there."),
  ] },
  { runs: [t("What it actually does:", { bold: true, color: P.primary })] },
  { runs: [
    t("→ Remembers", { bold: true }),
    t(" — facts, decisions and preferences are embedded on-device (384-dim vectors) and recalled across sessions"),
  ] },
  { runs: [
    t("→ Enhances", { bold: true }),
    t(" — relevant memories are silently injected before each answer"),
  ] },
  { runs: [
    t("→ Saves tokens", { bold: true }),
    t(" — bloated history becomes a dense digest; every saved token is counted"),
  ] },
  { runs: [
    t("→ Mirrors to YOUR GitHub", { bold: true }),
    t(" — a private repo in your own account becomes the cloud database, human-readable, auto-synced"),
  ] },
  { runs: [
    t("→ Searches everything", { bold: true }),
    t(" — one \u2318K query across sessions, memories and skills, with kind & date filters"),
  ] },
  { runs: [
    t("→ Stays safe", { bold: true }),
    t(" — a prompt-injection guard treats recalled data as data, never as instructions"),
  ] },
  { runs: [t("No signup. Open the app, get a private token, paste the magic prompt into agent mode. Done.")] },
  { runs: [
    t("\uD83D\uDE80 Live demo \u2192 zaimem.space-z.ai", { bold: true, color: P.accent }),
  ] },
  { runs: [t("\uD83D\uDCBB Source (MIT) \u2192 github.com/romangalaxys10-spec/zaimem")] },
  { runs: [t("\uD83D\uDC33 Docker \u2192 docker pull ghcr.io/romangalaxys10-spec/zaimem")] },
  { runs: [t("Built with GLM 5.3 Flash \u00B7 Led by Roman \u2014 Rommark.Dev", { color: P.secondary })] },
  { runs: [
    t("#AI #OpenSource #AIAgents #LLM #MCP #ModelContextProtocol #DevTools #VectorSearch #BuildInPublic", { bold: true, color: "0A66C2" }),
  ] },
];

const postText = [
  "Every AI agent has amnesia. You close the chat — and everything it learned about you is gone.",
  "We built ZaiMem to end that.",
  "ZaiMem is an open-source memory & context layer for chat.z.ai agents — an MCP server that gives any agent a persistent vector memory, an automatic context enhancer and a built-in token saver. One private token, one pasted prompt — the session syncs itself from there.",
  "What it actually does:",
  "→ Remembers — facts, decisions and preferences are embedded on-device (384-dim vectors) and recalled across sessions",
  "→ Enhances — relevant memories are silently injected before each answer",
  "→ Saves tokens — bloated history becomes a dense digest; every saved token is counted",
  "→ Mirrors to YOUR GitHub — a private repo in your own account becomes the cloud database, human-readable, auto-synced",
  "→ Searches everything — one ⌘K query across sessions, memories and skills, with kind & date filters",
  "→ Stays safe — a prompt-injection guard treats recalled data as data, never as instructions",
  "No signup. Open the app, get a private token, paste the magic prompt into agent mode. Done.",
  "🚀 Live demo → zaimem.space-z.ai",
  "💻 Source (MIT) → github.com/romangalaxys10-spec/zaimem",
  "🐳 Docker → docker pull ghcr.io/romangalaxys10-spec/zaimem",
  "Built with GLM 5.3 Flash · Led by Roman — Rommark.Dev",
  "#AI #OpenSource #AIAgents #LLM #MCP #ModelContextProtocol #DevTools #VectorSearch #BuildInPublic",
].join("\n\n");
console.log("post characters:", postText.length, "(LinkedIn limit 3000)");

// ── document assembly ───────────────────────────────────────────────────
const divider = new Paragraph({
  spacing: { before: 120, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
  children: [t("", { size: 2 })],
});

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: P.body },
        paragraph: { spacing: { line: 400 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      },
    },
    children: [
      // title (centered, punchy)
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80, line: 460, lineRule: "atLeast" },
        children: [t("LinkedIn Post \u2014 ZaiMem Launch", { bold: true, size: 36, color: P.primary })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 160 },
        children: [t("Product announcement \u00B7 ready to paste \u00B7 " + postText.length + " characters (limit 3,000)", { size: 20, color: P.secondary })],
      }),
      divider,

      // the post itself
      ...POST_LINES.map((l) => para(l.runs)),

      divider,

      // notes — small grey, per scene structure
      para([t("Posting notes", { bold: true, size: 20, color: P.secondary })], { spacing: { before: 120, after: 80, line: 320 } }),
      para([t("\u2022 The first two lines are the hook \u2014 LinkedIn truncates after ~210 characters with a \u201C\u2026see more\u201D fold, and the bold opener is written to survive it.", { size: 20, color: P.secondary })], { spacing: { before: 60, after: 60, line: 320 } }),
      para([t("\u2022 Tip: put the live-demo URL in the first comment \u2014 posts with fewer outbound links in the body typically reach further, and you can bump your own comment.", { size: 20, color: P.secondary })], { spacing: { before: 60, after: 60, line: 320 } }),
      para([t("\u2022 Hashtags: 3\u20135 is LinkedIn's sweet spot \u2014 keep #AI #OpenSource #AIAgents and drop the rest if you prefer a cleaner look.", { size: 20, color: P.secondary })], { spacing: { before: 60, after: 60, line: 320 } }),
      para([t("\u2022 Attach an image \u2014 docs/social-preview.png from the repo (banner with the product name + badges) roughly doubles dwell time vs a text-only post.", { size: 20, color: P.secondary })], { spacing: { before: 60, after: 60, line: 320 } }),
      para([t("\u2022 Best windows to post: Tue\u2013Thu, 8\u201310 AM in your audience's timezone. Reply to every comment in the first hour \u2014 the algorithm rewards early conversation.", { size: 20, color: P.secondary })], { spacing: { before: 60, after: 60, line: 320 } }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/zaimem-linkedin-post.docx", buf);
  console.log("written: /home/z/my-project/download/zaimem-linkedin-post.docx");
});
