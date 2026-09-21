document.documentElement.classList.add('js');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
menu.hidden = false;
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
nav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus();}});
document.querySelector('#year').textContent=new Date().getFullYear();
const dialog=document.querySelector('#lightbox');
if(typeof dialog.showModal==='function'){
  document.querySelectorAll('.gallery-link').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const img=link.querySelector('img');dialog.querySelector('img').src=link.href;dialog.querySelector('img').alt=img.alt;dialog.querySelector('p').textContent=link.closest('figure').querySelector('figcaption span').textContent;dialog.showModal();}));
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
}
