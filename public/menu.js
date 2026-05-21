// 移动端折叠菜单
document.addEventListener('DOMContentLoaded',()=>{
  const nav=document.querySelector('.nav-links');
  if(!nav) return;
  if(document.getElementById('nav-toggle')) return;
  const btn=document.createElement('button');
  btn.id='nav-toggle';
  btn.className='nav-toggle';
  btn.textContent='☰';
  nav.parentElement.insertBefore(btn,nav.nextSibling);
  btn.addEventListener('click',()=>{
    nav.style.display = nav.style.display==='flex' ? 'none' : 'flex';
  });
  function sync(){ nav.style.display=(window.innerWidth<=640)?'none':'flex'; }
  window.addEventListener('resize',sync); sync();
});