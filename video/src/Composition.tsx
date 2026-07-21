import React from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

const INK = "#0A0A0A";
const PAPER = "#FFFFFF";
const SCAN = "#B7FF4A";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const BeatFade = ({duration, children}: {duration: number; children: React.ReactNode}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: PAPER}}>
      <AbsoluteFill
        style={{
          opacity: interpolate(frame, [0, 18, duration - 12, duration], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          translate: interpolate(frame, [0, 24], ["0px 14px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const BrandMark = ({inverse = false, size = 56}: {inverse?: boolean; size?: number}) => (
  <Img
    alt=""
    src={staticFile("assets/brand-iustitia-256.png")}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      filter: inverse ? "brightness(0) invert(1)" : "none",
    }}
  />
);

const Brand = ({inverse = false, compact = false}: {inverse?: boolean; compact?: boolean}) => (
  <div className={"brand " + (compact ? "brand-compact" : "")} style={{color: inverse ? PAPER : INK}}>
    <BrandMark inverse={inverse} size={compact ? 30 : 42}/>
    <span>Served</span>
  </div>
);

const OpenAIWordmark = () => (
  <Img alt="OpenAI" className="openai-wordmark" src={staticFile("assets/openai-wordmark.png")}/>
);

const ModelPill = ({label}: {label: string}) => (
  <div className="model-pill">
    <OpenAIWordmark/>
    <span>{label}</span>
  </div>
);

const RestaurantSketch = ({muted = false}: {muted?: boolean}) => (
  <svg className="restaurant-sketch" viewBox="0 0 820 390" fill="none" aria-hidden="true" style={{opacity: muted ? 0.12 : 1}}>
    <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 318H708"/>
      <path d="M166 310V139H654V310"/>
      <path d="M146 139H674L637 82H183L146 139Z"/>
      <path d="M183 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M249 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M315 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M381 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M447 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M513 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <path d="M579 139v41c0 18 15 33 33 33s33-15 33-33v-41"/>
      <rect x="222" y="232" width="112" height="78" rx="3"/>
      <rect x="493" y="232" width="112" height="78" rx="3"/>
      <path d="M378 310v-92h72v92"/>
      <circle cx="430" cy="265" r="3" fill="currentColor" strokeWidth="0"/>
      <path d="M271 251h14M542 251h14"/>
    </g>
    <text x="410" y="120" textAnchor="middle" fill="currentColor" fontFamily="IBM Plex Sans, Arial" fontSize="27" fontWeight="700" letterSpacing="7">RAUL&apos;S</text>
    <text x="410" y="352" textAnchor="middle" fill="currentColor" fontFamily="IBM Plex Sans, Arial" fontSize="13" fontWeight="600" letterSpacing="4">SMALL RESTAURANT · BUILT ONE DAY AT A TIME</text>
  </svg>
);

const EnvelopeSketch = () => (
  <svg className="envelope-sketch" viewBox="0 0 340 230" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="18" y="25" width="304" height="180" rx="14"/>
      <path d="m31 48 139 101L309 48"/>
      <path d="m31 190 101-83M309 190l-101-83"/>
    </g>
    <circle cx="170" cy="176" r="20" fill={PAPER} stroke={INK} strokeWidth="4"/>
    <path d="m160 176 7 7 14-16" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RaulFigure = () => (
  <svg className="raul-figure" viewBox="0 0 300 430" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="150" cy="70" r="48"/>
      <path d="M127 70h2M171 70h2"/>
      <path d="M134 92c10 7 22 7 32 0"/>
      <path d="M90 380 104 155c2-28 23-45 46-45s44 17 46 45l14 225"/>
      <path d="M111 179c20 12 58 12 78 0"/>
      <path d="M104 205 57 259M196 205l47 54"/>
      <rect x="94" y="240" width="112" height="83" rx="7" fill={PAPER}/>
      <path d="m105 253 45 34 45-34"/>
    </g>
  </svg>
);

const PhoneSketch = () => (
  <svg className="phone-sketch" viewBox="0 0 240 210" fill="none" aria-hidden="true">
    <path d="M42 105c-9-19-6-41 8-57l24-24c7-7 19-5 24 4l12 23c4 8 2 17-5 22L91 84c17 25 40 45 68 58l10-15c5-7 15-10 23-6l23 11c10 5 12 18 4 25l-23 21c-15 14-37 18-56 10-44-18-80-47-98-83Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RestaurantBeat = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="story-canvas">
      <div className="restaurant-wrap" style={{
        opacity: interpolate(frame, [0, 34], [0, 1], {extrapolateRight: "clamp", easing: ease}),
        scale: interpolate(frame, [0, 46], [0.94, 1], {extrapolateRight: "clamp", easing: ease}),
      }}><RestaurantSketch/></div>
      <div className="story-copy bottom-copy">
        <span>A SMALL BUSINESS STORY</span>
        <h1>Raul&apos;s restaurant<br/><em>is already struggling.</em></h1>
      </div>
    </AbsoluteFill>
  );
};

const PressureBeat = () => {
  const frame = useCurrentFrame();
  const burdens = [
    {label: "PAYROLL DUE", from: 18, x: 180, y: 292},
    {label: "SUPPLIER INVOICE", from: 42, x: 1450, y: 336},
    {label: "SLOW WEEK", from: 66, x: 1410, y: 706},
  ];
  return (
    <AbsoluteFill className="story-canvas">
      <div className="restaurant-wrap compact-store"><RestaurantSketch/></div>
      {burdens.map((item) => <div key={item.label} className="burden-tag" style={{
        left: item.x,
        top: item.y,
        opacity: interpolate(frame, [item.from, item.from + 18], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
        translate: interpolate(frame, [item.from, item.from + 24], ["0px 12px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
      }}>{item.label}</div>)}
      <div className="pressure-copy">
        <h2>Payroll is due.</h2>
        <p style={{opacity: interpolate(frame, [58, 82], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease})}}>Every dollar matters.</p>
      </div>
    </AbsoluteFill>
  );
};

const LetterBeat = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="story-canvas letter-beat">
      <div className="restaurant-wrap compact-store"><RestaurantSketch muted/></div>
      <div className="letter-arrival" style={{
        opacity: interpolate(frame, [8, 30], [0, 1], {extrapolateRight: "clamp", easing: ease}),
        translate: interpolate(frame, [0, 44], ["0px -150px", "0px 0px"], {extrapolateRight: "clamp", easing: ease}),
        rotate: interpolate(frame, [0, 44], ["-5deg", "0deg"], {extrapolateRight: "clamp", easing: ease}),
      }}>
        <EnvelopeSketch/>
        <span>FINANCIAL RECORDS SUBPOENA</span>
      </div>
      <div className="story-copy upper-copy">
        <span>THEN ONE MORNING</span>
        <h1>Raul is <em>served.</em></h1>
      </div>
    </AbsoluteFill>
  );
};

const QuestionChip = ({text, from, x, y}: {text: string; from: number; x: number; y: number}) => {
  const frame = useCurrentFrame();
  return <div className="question-chip" style={{
    left: x,
    top: y,
    opacity: interpolate(frame, [from, from + 18], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
    translate: interpolate(frame, [from, from + 26], ["0px 18px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
  }}>{text}</div>;
};

const QuestionsBeat = () => {
  const questions = [
    {text: "What is this?", from: 24, x: 220, y: 235},
    {text: "Is it real?", from: 48, x: 1450, y: 226},
    {text: "What do they want?", from: 72, x: 180, y: 455},
    {text: "How much time do I have?", from: 96, x: 1390, y: 450},
    {text: "Do I need to call my bank?", from: 120, x: 162, y: 700},
    {text: "Can I afford a lawyer?", from: 144, x: 1418, y: 694},
    {text: "What happens if I get it wrong?", from: 168, x: 710, y: 865},
  ];
  return (
    <AbsoluteFill className="question-canvas">
      <div className="question-heading"><span>RAUL DOESN&apos;T KNOW WHAT TO DO</span><h2>The letter arrived.<br/>The next step did not.</h2></div>
      <div className="raul-wrap"><RaulFigure/></div>
      {questions.map((question) => <QuestionChip key={question.text} {...question}/>)}
    </AbsoluteFill>
  );
};

const SolutionBeat = () => (
  <AbsoluteFill className="solution-beat">
    <BrandMark size={94}/>
    <span>THE BURDEN GETS SMALLER</span>
    <h1>Served solves this.</h1>
    <p>A clear next step—without asking Raul to become a lawyer.</p>
  </AbsoluteFill>
);

const FounderStatement = ({from, to, children}: {from: number; to: number; children: React.ReactNode}) => {
  const frame = useCurrentFrame();
  return <div className="founder-statement" style={{
    opacity: interpolate(frame, [from, from + 18, to - 18, to], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
    translate: interpolate(frame, [from, from + 24], ["0px 18px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
  }}>{children}</div>;
};

const FounderBeat = () => (
  <AbsoluteFill className="founder-beat">
    <PhoneSketch/>
    <FounderStatement from={0} to={108}><span>THIS PROBLEM IS PERSONAL</span><h2>This problem is personal<br/>to our team.</h2></FounderStatement>
    <FounderStatement from={100} to={224}><span>WHY WE BUILT SERVED</span><h2>I worked as a legal assistant<br/>in law offices for years.</h2></FounderStatement>
    <FounderStatement from={216} to={330}><span>OVER AND OVER</span><h2>I heard these questions from<br/>small-business owners, over and over.</h2></FounderStatement>
  </AbsoluteFill>
);

const StepShell = ({number, title, subtitle, role, children}: {number: string; title: string; subtitle: string; role: string; children: React.ReactNode}) => (
  <AbsoluteFill className="workflow-beat">
    <div className="workflow-brand"><Brand compact/></div>
    <div className="step-heading">
      <span>{number} / 05</span>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    <div className="centered-stage">
      <div className="stage-meta"><span>ONE CLEAR NEXT STEP</span><strong>{role}</strong></div>
      {children}
    </div>
  </AbsoluteFill>
);

const UploadBeat = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [26, 132], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease});
  return (
    <StepShell number="01" title="Upload what arrived." subtitle="PDF · photo · scan" role="GPT-5.6 READER">
      <div className="upload-object">
        <div className="mini-document">
          <div className="mini-doc-head"><span>SUBPOENA</span><span>26-CV-1842</span></div>
          {[82, 62, 91, 73, 54].map((width) => <i key={width} style={{width: String(width) + "%"}}/>)}
          <div className="mini-doc-stamp">RECEIVED</div>
        </div>
        <div className="scan-line" style={{top: String(14 + progress * 68) + "%", backgroundColor: SCAN}}/>
      </div>
      <div className="upload-progress"><div style={{width: String(progress * 100) + "%"}}/></div>
    </StepShell>
  );
};

const ReadBeat = () => {
  const frame = useCurrentFrame();
  const fields = [
    ["COURT", "District Court"],
    ["CASE", "26-CV-1842"],
    ["DEADLINE", "July 16, 2026"],
    ["RECORDS REQUESTED", "Payroll · Jan–Mar 2026"],
  ];
  return (
    <StepShell number="02" title="Served reads what matters." subtitle="The document becomes a small set of facts." role="GPT-5.6 READER + EXPLAINER">
      <div className="read-sheet">
        {fields.map((field, index) => <div key={field[0]} className="read-field" style={{
          opacity: interpolate(frame, [24 + index * 23, 42 + index * 23], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
          translate: interpolate(frame, [24 + index * 23, 48 + index * 23], ["18px 0px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
        }}><span>{field[0]}</span><strong>{field[1]}</strong></div>)}
        <ModelPill label="GPT-5.6 · RESPONSES API"/>
      </div>
    </StepShell>
  );
};

const VerifyBeat = () => {
  const frame = useCurrentFrame();
  const nodes = [
    ["DOCUMENT", "Exact excerpt"],
    ["PUBLIC DOCKET", "CourtListener"],
    ["VERIFIED SCOPE", "Code gate passed"],
  ];
  return (
    <StepShell number="03" title="Then it checks what is real." subtitle="Source evidence must match before financial tools open." role="CHECKER · VERSIONED CODE">
      <div className="verification-object">
        <div className="verification-chain">
          {nodes.map((node, index) => <React.Fragment key={node[0]}>
            <div className={"verify-node " + (index === 2 ? "verified-node" : "")} style={{
              opacity: interpolate(frame, [22 + index * 36, 42 + index * 36], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
              scale: interpolate(frame, [22 + index * 36, 48 + index * 36], [0.95, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
            }}><span>{node[0]}</span><b>{node[1]}</b></div>
            {index < 2 && <div className="verify-arrow">→</div>}
          </React.Fragment>)}
        </div>
        <div className="verification-proof" style={{opacity: interpolate(frame, [118, 144], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease})}}>
          <span>✓ Court matched</span><span>✓ Case matched</span><span>✓ Deadline matched</span>
        </div>
        <ModelPill label="GPT-5.6 GATHERS · CODE DECIDES"/>
      </div>
    </StepShell>
  );
};

const ConnectBeat = () => {
  const frame = useCurrentFrame();
  const connected = frame >= 70;
  const rows = ["PAYROLL ACH · AUDREA BARNES", "CHECK · #1048 · A. BARNES", "ACH CREDIT · A. B. PAYROLL"];
  return (
    <StepShell number="04" title="Served connects the accounts Raul chooses." subtitle="Only after the request is verified." role="PLAID SANDBOX + COOK">
      <div className="connection-object">
        <div className="plaid-simple-head"><span>PLAID SANDBOX</span><b>{connected ? "CONNECTED" : "AUTHORIZING"}</b></div>
        <div className="chosen-account">
          <div className="bank-monogram">FP</div>
          <div><b>First Platypus Bank</b><span>Business Checking ··4821</span></div>
          <strong>{connected ? "✓" : "···"}</strong>
        </div>
        <div className="record-stream">
          {rows.map((row, index) => <div key={row} style={{
            opacity: interpolate(frame, [72 + index * 22, 92 + index * 22], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
            translate: interpolate(frame, [72 + index * 22, 98 + index * 22], ["0px 14px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
          }}><i/><span>{row}</span><small>IN SCOPE</small></div>)}
        </div>
      </div>
    </StepShell>
  );
};

const ResultsBeat = () => {
  const frame = useCurrentFrame();
  return (
    <StepShell number="05" title="It finds only the records the request names." subtitle="Raul reviews every uncertain match." role="HUMAN REVIEW REQUIRED">
      <div className="results-object">
        <div className="results-summary" style={{opacity: interpolate(frame, [20, 42], [0, 1], {extrapolateRight: "clamp", easing: ease})}}>
          <span><b>7</b> include</span><i>·</i><span className="review-count"><b>2</b> review</span><i>·</i><span><b>19</b> kept out</span>
        </div>
        <div className="uncertain-record" style={{
          opacity: interpolate(frame, [60, 84], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
          translate: interpolate(frame, [60, 90], ["0px 16px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease}),
        }}>
          <div><span>NEEDS RAUL</span><b>ACH CREDIT · A. B. PAYROLL</b><small>Abbreviation candidate · $2,820.12</small></div>
          <div className="review-actions"><span>INCLUDE</span><span>KEEP OUT</span></div>
        </div>
        <div className="nothing-sent" style={{opacity: interpolate(frame, [112, 138], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease})}}>
          <BrandMark size={28}/><b>Nothing is sent automatically.</b><span>Raul keeps the decision.</span>
        </div>
      </div>
    </StepShell>
  );
};

const BriefBeat = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="brief-beat">
      <div className="brief-paper" style={{
        opacity: interpolate(frame, [0, 22], [0, 1], {extrapolateRight: "clamp", easing: ease}),
        translate: interpolate(frame, [0, 30], ["0px 24px", "0px 0px"], {extrapolateRight: "clamp", easing: ease}),
      }}>
        <div className="brief-paper-head"><Brand compact/><span>HUMAN REVIEW REQUIRED</span></div>
        <small>COUNSEL-READY BRIEF</small>
        <h2>Raul reviews it<br/>before anything leaves Served.</h2>
        <div className="brief-route"><b>RAUL</b><span>→</span><b>ATTORNEY OR ACCOUNTANT HE CHOOSES</b></div>
        <div className="brief-footer"><ModelPill label="GPT-5.6 EXPLAINER"/><span>Nothing produced or shared automatically.</span></div>
      </div>
    </AbsoluteFill>
  );
};

const EndBeat = () => (
  <AbsoluteFill className="end-beat">
    <BrandMark size={78}/>
    <h1>You&apos;ve been served.<br/><em>Now, you&apos;re Served.</em></h1>
    <p>No small business owner should face legal paperwork alone.</p>
    <div className="demo-cue">NEXT: LIVE PRODUCT DEMO <span>→</span></div>
    <div className="technology-credit"><OpenAIWordmark/><span>GPT-5.6 via the Responses API · Built with Codex</span></div>
    <small>Informational support—not legal advice.</small>
  </AbsoluteFill>
);

export const ServedStory = () => (
  <AbsoluteFill style={{backgroundColor: PAPER}}>
    <Sequence name="Raul's restaurant" durationInFrames={210}><BeatFade duration={210}><RestaurantBeat/></BeatFade></Sequence>
    <Sequence name="A hard month" from={210} durationInFrames={150}><BeatFade duration={150}><PressureBeat/></BeatFade></Sequence>
    <Sequence name="The letter arrives" from={360} durationInFrames={180}><BeatFade duration={180}><LetterBeat/></BeatFade></Sequence>
    <Sequence name="Raul's questions" from={540} durationInFrames={270}><BeatFade duration={270}><QuestionsBeat/></BeatFade></Sequence>
    <Sequence name="Served solves this" from={810} durationInFrames={120}><BeatFade duration={120}><SolutionBeat/></BeatFade></Sequence>
    <Sequence name="Founder connection" from={930} durationInFrames={330}><BeatFade duration={330}><FounderBeat/></BeatFade></Sequence>
    <Sequence name="Step 1 - Upload" from={1260} durationInFrames={180}><BeatFade duration={180}><UploadBeat/></BeatFade></Sequence>
    <Sequence name="Step 2 - Read" from={1440} durationInFrames={180}><BeatFade duration={180}><ReadBeat/></BeatFade></Sequence>
    <Sequence name="Step 3 - Verify" from={1620} durationInFrames={180}><BeatFade duration={180}><VerifyBeat/></BeatFade></Sequence>
    <Sequence name="Step 4 - Connect" from={1800} durationInFrames={180}><BeatFade duration={180}><ConnectBeat/></BeatFade></Sequence>
    <Sequence name="Step 5 - Review" from={1980} durationInFrames={180}><BeatFade duration={180}><ResultsBeat/></BeatFade></Sequence>
    <Sequence name="Counsel-ready brief" from={2160} durationInFrames={120}><BeatFade duration={120}><BriefBeat/></BeatFade></Sequence>
    <Sequence name="Close" from={2280} durationInFrames={120}><BeatFade duration={120}><EndBeat/></BeatFade></Sequence>
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition id="Served-Raul-Story" component={ServedStory} durationInFrames={2400} fps={30} width={1920} height={1080}/>
);
