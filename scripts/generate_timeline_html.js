#!/usr/bin/env node
/**
 * 案件时间轴 HTML 生成器 v8
 *
 * - 支持多方当事人（parties 数组），每方独立颜色和位置
 * - 向后兼容 topParty/bottomParty 两方格式
 * - 箭头与圆点之间留间隙，箭头尖端不遮圆点/日期
 * - 全文展开，无不省略号
 * - 圆点绝对定位在轴线上，日期在圆点下方
 */

const fs = require('fs');
const inputPath = process.argv[2];
const outputPath = process.argv[3] || './案件时间轴.html';
if (!inputPath) { console.error('用法: node generate_timeline_html.js <events.json> [output.html]'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const { title, events } = data;
if (!events || events.length === 0) { console.error('错误: 没有事件数据'); process.exit(1); }

// ── 多方 party 配置（向后兼容 topParty/bottomParty）──
function buildPartyConfig(data) {
  if (data.parties && data.parties.length > 0) {
    const config = {};
    data.parties.forEach(p => { config[p.name] = { color: p.color, position: p.position }; });
    return { config, list: data.parties };
  }
  const tp = data.topParty || '原告';
  const bp = data.bottomParty || '被告';
  const list = [
    { name: tp, color: '#CC0000', position: 'top' },
    { name: bp, color: '#333333', position: 'bottom' }
  ];
  const config = {};
  list.forEach(p => { config[p.name] = { color: p.color, position: p.position }; });
  return { config, list };
}
const { config: partyConfig, list: partyList } = buildPartyConfig(data);

// 解析 party（支持"原告一、原告二"联合事件）
function resolveParty(party) {
  // 精确匹配
  if (partyConfig[party]) return { colors: [partyConfig[party].color], position: partyConfig[party].position };
  // 分隔解析
  const names = party.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  if (names.length > 1) {
    const cs = names.map(n => partyConfig[n]?.color).filter(Boolean);
    if (cs.length >= 1) {
      return { colors: cs, position: partyConfig[names[0]]?.position || 'bottom' };
    }
  }
  return { colors: ['#333333'], position: 'bottom' };
}
const getColor = p => resolveParty(p).colors[0];
const isTop = p => resolveParty(p).position;

const PER_PAGE = 18;
const totalPages = Math.max(1, Math.ceil(events.length / PER_PAGE));
function paginate(evts, pages) {
  const r = []; let idx = 0;
  for (let p = 0; p < pages; p++) {
    const rem = evts.length - idx, rp = pages - p;
    r.push(evts.slice(idx, idx + Math.ceil(rem / rp)));
    idx += r[r.length - 1].length;
  }
  return r;
}
const pages = paginate(events, totalPages);

function weights(evts) {
  return evts.map(e => Math.max(1.2, Math.min(Math.ceil(e.event.length / 10), 3)));
}
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function liten(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const l = v => Math.round(v + (255-v)*0.92);
  return '#'+[l(r),l(g),l(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function parseDate(str) {
  const m = str.match(/(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const m2 = str.match(/(\d{4})[年\-\/.](\d{1,2})/);
  return m2 ? new Date(+m2[1], +m2[2] - 1, 15) : null;
}

function legendHTML() {
  const topP = partyList.filter(p=>p.position==='top');
  const botP = partyList.filter(p=>p.position==='bottom');
  let h = '';
  if(topP.length) h += '<span class="lgg">上方：'+topP.map(p=>`<span style="--c:${p.color}">● ${esc(p.name)}</span>`).join('')+'</span>';
  if(botP.length) h += '<span class="lgg">下方：'+botP.map(p=>`<span style="--c:${p.color}">● ${esc(p.name)}</span>`).join('')+'</span>';
  return h;
}

function slideHTML(evts, idx) {
  const ws = weights(evts);
  // sqrt间隙值
  const gaps = [];
  for (let i = 1; i < evts.length; i++) {
    const a = parseDate(evts[i-1].date), b = parseDate(evts[i].date);
    const days = a && b ? Math.abs(Math.round((b - a) / 86400000)) : 30;
    gaps.push(Math.sqrt(Math.max(days, 1)) * 0.08);
  }
  let cols = '';
  for (let i = 0; i < evts.length; i++) {
    const e = evts[i], rp = resolveParty(e.party), c = rp.colors[0], top = rp.position==='top', w = ws[i], bg = liten(c);
    const dotStyle = rp.colors.length > 1
      ? `width:14px;height:14px;background:conic-gradient(${rp.colors.map((cl,k)=>`${cl} ${k/rp.colors.length*100}% ${(k+1)/rp.colors.length*100}%`).join(',')});`
      : '';
    cols += `
      <div class="col" style="flex:${w};--pc:${c};--pc-bg:${bg};">
        <div class="half ht">${top ? `
          <div class="card"><p>${esc(e.event)}</p></div>
          <div class="arr adn"></div>
          <div class="clear"></div>` : ''}</div>
        <div class="half hb">${!top ? `
          <div class="clear clear-bot"></div>
          <div class="arr aup"></div>
          <div class="card"><p>${esc(e.event)}</p></div>` : ''}</div>
        <div class="dot${rp.colors.length>1?' dot-m':''}" style="${dotStyle}"></div>
        <div class="dt">${esc(e.date)}</div>
      </div>`;
    if (i < evts.length - 1) {
      cols += `<div class="gap-col" style="flex:${gaps[i].toFixed(2)};"></div>`;
    }
  }
  const lbl = totalPages > 1 ? `${idx+1}/${totalPages}` : '';
  return `<div class="slide${idx===0?' active':''}" data-p="${idx}">
    <div class="inner">
      <div class="hd"><h1>${esc(title)}</h1>
        <div class="lgd">${legendHTML()}</div>
        ${lbl?`<span class="pn">${lbl}</span>`:''}
      </div>
      <div class="tla"><div class="tll"></div><div class="tlc">${cols}</div></div>
    </div></div>`;
}

const nav = totalPages > 1 ? `
  <div class="nav"><button class="nb" id="pb" onclick="chg(-1)">◀</button>
    <div class="nd">${pages.map((_,i)=>`<span class="ndot${i===0?' a':''}" onclick="go(${i})"></span>`).join('')}</div>
    <button class="nb" id="nb2" onclick="chg(1)">▶</button></div>` : '';

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(title)}</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#1a1a2e;color:#333;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.tb{position:fixed;top:12px;right:12px;z-index:100;display:flex;gap:6px}
.tb button{padding:6px 14px;border:1px solid rgba(255,255,255,.15);border-radius:6px;background:rgba(255,255,255,.06);color:#aaa;cursor:pointer;font-size:12px;font-family:inherit;transition:all .2s;backdrop-filter:blur(8px)}
.tb button:hover{background:rgba(255,255,255,.12);color:#fff}
.sc{position:relative;width:100%;max-width:1500px}
.slide{display:none;animation:fdi .3s ease}.slide.active{display:block}
@keyframes fdi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.inner{background:#fff;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.35);padding:16px 20px 12px;aspect-ratio:16/9;display:flex;flex-direction:column;position:relative;overflow:hidden}
.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-shrink:0;gap:12px}
.hd h1{font-size:18px;font-weight:700;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.lgd{display:flex;gap:10px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.lgg{font-size:10px;font-weight:600;display:flex;gap:6px;flex-wrap:wrap;align-items:center;white-space:nowrap}
.lgg span{font-size:10px;font-weight:600;color:var(--c)}
.pn{font-size:11px;color:#999;font-weight:500;white-space:nowrap;flex-shrink:0}
.tla{flex:1;position:relative;min-height:0}
.tll{position:absolute;left:0;right:22px;top:50%;height:0;border-top:4.5pt solid #333;transform:translateY(-50%)}
.tll::after{content:'';position:absolute;right:-17px;top:50%;transform:translateY(-50%);width:0;height:0;border-left:17px solid #333;border-top:10px solid transparent;border-bottom:10px solid transparent}
.tlc{display:flex;align-items:stretch;width:100%;height:100%;position:relative;z-index:1}

/* 列 */
.col{display:flex;flex-direction:column;align-items:center;min-width:60px;position:relative}
.gap-col{min-width:4px;flex-shrink:1}
.half{flex:1;display:flex;flex-direction:column;align-items:center;width:100%;padding:0 2px}
.ht{justify-content:flex-end}.hb{justify-content:flex-start}

/* 卡片：min-height 替代 height，全文可见 */
.card{width:100%;min-height:2.5cm;border-radius:5px;padding:5px 7px;border-left:3px solid var(--pc);box-shadow:0 1px 3px rgba(0,0,0,.06);background:linear-gradient(135deg,var(--pc-bg),#fff)}
.card p{font-size:11px;font-weight:600;line-height:1.45;color:var(--pc);word-break:break-all;overflow-wrap:break-word}

/* 箭头 1.5pt + 三角 */
.arr{width:1.5pt;height:0;min-height:1.6cm;flex:1;max-height:1.8cm;background:var(--pc);position:relative;flex-shrink:1}
.adn::after{content:'';position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--pc)}
.aup::before{content:'';position:absolute;top:-1px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:7px solid var(--pc)}

/* 间隙：箭头三角与圆点之间的空白 */
.clear{height:0.3cm;flex-shrink:0}
.clear-bot{height:0.6cm}

/* 圆点：绝对定位在轴线上 */
.dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--pc);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15);z-index:5}
.dot.dot-m{width:14px;height:14px;border-width:2px}
/* 日期：圆点下方 */
.dt{position:absolute;top:calc(50% + 7px);left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;color:#555;line-height:1;white-space:nowrap;background:rgba(255,255,255,.85);padding:0 2px;z-index:4}

.nav{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px}
.nb{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#bbb;cursor:pointer;font-size:12px;transition:all .2s;display:flex;align-items:center;justify-content:center}
.nb:hover{background:rgba(255,255,255,.12);color:#fff}.nb:disabled{opacity:.25;cursor:not-allowed}
.nd{display:flex;gap:6px}
.ndot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15);cursor:pointer;transition:all .2s}
.ndot.a{background:#CC0000;transform:scale(1.4);box-shadow:0 0 6px rgba(204,0,0,.3)}
.ndot:hover:not(.a){background:rgba(255,255,255,.35)}
@media print{body{background:#fff;padding:0}.tb,.nav{display:none!important}.slide{display:block!important;page-break-after:always;animation:none}.slide:last-child{page-break-after:avoid}.inner{box-shadow:none;border-radius:0;aspect-ratio:auto;height:100vh;padding:12px 12px 8px}}
@media(max-width:1100px){body{padding:8px}.inner{aspect-ratio:auto;min-height:55vh;padding:8px 6px 4px}.hd h1{font-size:13px}.card p{font-size:9px}.dt{font-size:7px}}
@media(min-width:1700px){.sc{max-width:1650px}.hd h1{font-size:21px}.card p{font-size:12px}.dt{font-size:9px}}
</style></head><body>
<div class="tb"><button onclick="prt()">🖨 打印</button><button onclick="fs()">📺 全屏</button></div>
<div class="sc" id="sc">${pages.map((p,i)=>slideHTML(p,i)).join('\n')}</div>${nav}
<script>
let cp=0;const tp=${totalPages};
function show(n){document.querySelectorAll('.slide').forEach((s,i)=>s.classList.toggle('active',i===n));document.querySelectorAll('.ndot').forEach((d,i)=>d.classList.toggle('a',i===n));const pb=document.getElementById('pb'),nb2=document.getElementById('nb2');if(pb)pb.disabled=n===0;if(nb2)nb2.disabled=n===tp-1;cp=n;document.querySelector('.sc').scrollIntoView({behavior:'smooth',block:'center'})}
function chg(d){const np=cp+d;if(np>=0&&np<tp)show(np)}function go(n){show(n)}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();chg(1)}else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();chg(-1)}else if(e.key==='f'||e.key==='F')fs()})
function fs(){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{})}
function prt(){document.querySelectorAll('.slide').forEach(s=>s.classList.add('active'));window.print();setTimeout(()=>document.querySelectorAll('.slide').forEach((s,i)=>s.classList.toggle('active',i===cp)),100)}
</script></body></html>`;

fs.writeFileSync(outputPath, html, 'utf-8');
const topNames = partyList.filter(p=>p.position==='top').map(p=>p.name).join('/');
const botNames = partyList.filter(p=>p.position==='bottom').map(p=>p.name).join('/');
console.log(`✅ HTML: ${outputPath}  |  ${totalPages}页 ${events.length}事件  |  上:${topNames} 下:${botNames}`);
