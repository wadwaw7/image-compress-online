// 日夜主题切换脚本
document.addEventListener('DOMContentLoaded',()=>{
  const KEY='themeMode';
  // 若已存在按钮，避免重复插入
  if(document.getElementById('nav-theme')) return;
  const btn=document.createElement('button');
  btn.id='nav-theme';
  btn.textContent='🌙';
  btn.style.cssText='background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--muted)';
  const nav=document.querySelector('.nav-links');
  if(nav) nav.appendChild(btn);
  function apply(mode){
    document.documentElement.setAttribute('data-theme',mode);
    btn.textContent = mode==='dark' ? '☀️' : '🌙';
  }
  let mode=localStorage.getItem(KEY)||'light';
  apply(mode);
  btn.onclick=()=>{
    mode = (mode==='dark')?'light':'dark';
    localStorage.setItem(KEY,mode);
    apply(mode);
  };
});