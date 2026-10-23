document.documentElement.classList.add('js');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
menu.hidden = false;
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
nav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus();}});
document.querySelector('#year').textContent=new Date().getFullYear();
const copyEmail = document.querySelector('#copy-email');
if (copyEmail) {
  copyEmail.hidden = false;
  copyEmail.addEventListener('click', async () => {
    const status = document.querySelector('#copy-email-status');
    try {
      await navigator.clipboard.writeText('exceptionallyfloral@gmail.com');
      status.textContent = 'Email address copied. Paste it into your preferred email service.';
    } catch {
      status.textContent = 'Copy was unavailable. Select and copy this address: exceptionallyfloral@gmail.com';
    }
  });
}
const dialog=document.querySelector('#lightbox');
if(typeof dialog.showModal==='function'){
  document.addEventListener('click',event=>{const link=event.target.closest('.gallery-link');if(!link)return;event.preventDefault();const img=link.querySelector('img');dialog.querySelector('img').src=link.href;dialog.querySelector('img').alt=img.alt;dialog.querySelector('p').textContent=link.closest('figure').querySelector('figcaption span').textContent;dialog.showModal();});
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
}
