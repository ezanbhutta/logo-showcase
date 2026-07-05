const fs = require('fs');
let css = fs.readFileSync('web/styles.css', 'utf8');

// 1. Update font-mono usage and inputs
css = css.replace(/input\[type="search"\] \{([\s\S]*?)\}/, `input[type="search"] {
  width: 100%;
  height: 36px;
  background: var(--input-bg);
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: var(--r-btn) var(--r-btn) 0 0;
  padding: 0 12px;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--ink);
  transition: all 0.3s var(--spring);
}
input[type="search"]:focus {
  outline: none;
  background: rgba(0,0,0,0.6);
  border-bottom: 1px solid var(--accent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}`);
css = css.replace(/input\[type="search"\]:focus \{([\s\S]*?)\}/, ''); // It was removed by previous if overlap, but just in case.

css = css.replace(/input\[list\], select \{([\s\S]*?)\}/, `input[list], select {
  width: 100%; height: 32px;
  background: var(--input-bg);
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: var(--r-btn) var(--r-btn) 0 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--ink);
  padding: 0 12px;
  cursor: pointer;
  -webkit-appearance: none;
  transition: all 0.3s var(--spring);
}`);
css = css.replace(/input\[list\]:focus, select:focus \{([\s\S]*?)\}/, `input[list]:focus, select:focus { outline: none; border-bottom-color: var(--accent); background: rgba(0,0,0,0.6); }`);

css = css.replace(/\.lbl \{([\s\S]*?)\}/, `.lbl { font-size: var(--text-micro); font-family: var(--font-mono); font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }`);

css = css.replace(/\.segmented \{([\s\S]*?)\}/, `.segmented {
  display: flex; background: var(--input-bg);
  padding: 2px; border-radius: 8px; border: 1px solid var(--border);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
}`);
css = css.replace(/\.seg \{([\s\S]*?)\}/, `.seg {
  flex: 1; padding: 6px 12px; font-family: var(--font-mono); font-size: var(--text-micro); font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--muted); border-radius: 6px; text-align: center;
  transition: all 0.3s var(--spring);
}`);
css = css.replace(/\.seg\.active \{([\s\S]*?)\}/, `.seg.active {
  background: var(--panel-bg); color: var(--ink);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15);
}`);

css = css.replace(/\.picker \{([\s\S]*?)\}/, `.picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: var(--r-btn);
  max-height: 240px;
  overflow-y: auto;
  padding-right: 0;
}`);
css = css.replace(/\.pcard \{([\s\S]*?)\}/, `.pcard {
  position: relative;
  aspect-ratio: 1;
  background: var(--input-bg);
  border: none;
  border-radius: 0;
  overflow: hidden;
  cursor: pointer;
  display: flex; flex-direction: column;
}
.pcard::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 120%);
  opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.pcard:hover::after { opacity: 1; }`);

css = css.replace(/\.pthumb img \{([\s\S]*?)\}/, `.pthumb img { max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); transition: transform 0.4s var(--spring); }
.pcard:hover .pthumb img { transform: scale(1.1); }`);

css = css.replace(/\.cta \{([\s\S]*?)\}/, `.cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 16px; height: 32px;
  background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%), var(--ink);
  color: var(--canvas-bg);
  font-family: var(--font-mono);
  font-size: var(--text-sm); font-weight: 600;
  border-radius: var(--r-btn);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
  transition: all 0.2s var(--spring);
}`);
css = css.replace(/\.cta:hover \{([\s\S]*?)\}/, `.cta:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3); }`);
css = css.replace(/\.cta:active \{([\s\S]*?)\}/, `.cta:active { transform: scale(0.96); box-shadow: 0 1px 4px rgba(0,0,0,0.2); }`);

css = css.replace(/\.modal-bg \{([\s\S]*?)\}/, `.modal-bg { position: absolute; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); mask-image: radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,1) 100%); -webkit-mask-image: radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,1) 100%); }`);

css = css.replace(/\.sk-page \{([\s\S]*?)\}/, `.sk-page {
  width: 70%; aspect-ratio: 1 / 1.414;
  background: transparent; border: 1px solid var(--border);
  display: grid; grid-template-columns: 1fr 1fr; gap: 8%; padding: 8%;
}`);
css = css.replace(/\.sk-tile \{([\s\S]*?)\}/, `.sk-tile { 
  background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 5px); 
  border: 1px solid var(--border);
  border-radius: 0; 
}`);

css = css.replace(/\.assetgrid \{([\s\S]*?)\}/, `.assetgrid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1px;
  background: var(--border); border: 1px solid var(--border);
}`);
css = css.replace(/\.acard \{([\s\S]*?)\}/, `.acard {
  display: flex; flex-direction: column; gap: 0; cursor: pointer;
  background: var(--panel-bg);
}`);
css = css.replace(/\.athumb \{([\s\S]*?)\}/, `.athumb {
  aspect-ratio: 4/3; background: var(--input-bg);
  border: none; border-radius: 0;
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  transition: all 0.3s var(--spring);
}
.athumb::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.4) 150%);
  opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.acard:hover .athumb::after { opacity: 1; }`);

css = css.replace(/\.acap \{([\s\S]*?)\}/, `.acap { display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--panel-bg); }`);

fs.writeFileSync('web/styles.css', css + `\n/* Append placeholder overrides for inputs */\ninput::placeholder { font-family: var(--font-mono); font-size: var(--text-micro); opacity: 0.5; text-transform: uppercase; letter-spacing: 0.05em; }\n.palette .modal-bg { mask-image: radial-gradient(circle at center top, rgba(0,0,0,0.2) 0%, rgba(0,0,0,1) 80%); -webkit-mask-image: radial-gradient(circle at center top, rgba(0,0,0,0.2) 0%, rgba(0,0,0,1) 80%); }\n`);
console.log('Update script finished.');
