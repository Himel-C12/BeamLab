(()=>{
  const updateThemeIcon=()=>{
    const b=document.querySelector('#themeBtn');
    if(!b)return;
    const dark=document.body.classList.contains('dark');
    // Show the current theme clearly: moon in dark mode, sun in light mode.
    b.textContent=dark?'☾':'☀';
    b.setAttribute('aria-label',dark?'Dark theme':'Light theme');
    b.setAttribute('title',dark?'Dark theme':'Light theme');
  };
  updateThemeIcon();
  document.querySelector('#themeBtn')?.addEventListener('click',()=>setTimeout(updateThemeIcon,0));
})();
