(function(){
  var container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);

  function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-msg">' + message + '</span><button class="toast-close">&times;</button>';
    container.appendChild(toast);

    var closeBtn = toast.querySelector('.toast-close');
    var timer;
    var remove = function() {
      clearTimeout(timer);
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all .2s ease';
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 200);
    };

    closeBtn.addEventListener('click', remove);
    timer = setTimeout(remove, 4000);
  }

  window.showToast = showToast;
})();
