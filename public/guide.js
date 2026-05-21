// 简易新手提示框
(function(){
  const GUIDE_KEY = 'hideGuide';
  function createGuide(){
    const mask = document.createElement('div');
    mask.id='guide-mask';
    mask.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:none';
    const box=document.createElement('div');
    box.id='guide-box';
    box.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:440px;width:90%;background:#fff;border-radius:12px;padding:24px;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.15);display:none';
    box.innerHTML=`<h2 style="font-size:18px;font-weight:600;margin-bottom:12px;">使用提示</h2>
<ul style="line-height:1.8;font-size:14px;color:#4b5563;margin:0 0 12px 18px;padding:0;list-style:disc;">
<li><b>运行模式</b>：先选择本地/服务器，再上传图片。</li>
<li><b>上传图片</b>：支持拖拽或点击按钮批量选择。</li>
<li><b>全部压缩</b>：本地立即处理；服务器进入队列，可后台轮询。</li>
<li><b>全部下载</b>：服务器压缩完成后可一键打包下载。</li>
<li><b>清除记录</b>：删除已完成任务以释放列表。</li>
<li><b>其它工具</b>：导航栏可进入换底色、去水印等页面。</li>
<li>如有问题欢迎点击右上角<b>反馈</b>联系作者。</li>
</ul>
<div style="text-align:right;display:flex;gap:10px;justify-content:flex-end;">
<button id="guide-close" style="padding:8px 18px;background:#d1d5db;border:none;border-radius:8px;cursor:pointer;">关闭</button>
<button id="guide-never" style="padding:8px 18px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;">不再提示</button></div>`;
    document.body.appendChild(mask);
    document.body.appendChild(box);
    document.getElementById('guide-close').onclick=()=>hideGuide(false);
    document.getElementById('guide-never').onclick=()=>hideGuide(true);
    return {mask,box};
  }
  function showGuide(){
    const els = getEls(); els.mask.style.display=els.box.style.display='block';
  }
  function hideGuide(permanent){
    const els = getEls(); els.mask.style.display=els.box.style.display='none';
    if(permanent) localStorage.setItem(GUIDE_KEY,'1');
  }
  let cache=null;
  function getEls(){ if(cache) return cache; return cache=createGuide(); }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      if(window.state && window.state.token && !localStorage.getItem(GUIDE_KEY)) showGuide();
    },300);
  });
})();