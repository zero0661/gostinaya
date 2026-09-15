# English Audio Essays navigation

Production state recorded on 2026-09-15.

## Page

- title: `Audio Essays`
- slug: `en-audio-essays`
- public URL: `https://milenin.pro/en-audio-essays/`
- status: published
- body:

  > This page will bring together the English audio editions of selected After Login essays. New recordings will appear here as they are released.
  >
  > Sometimes a text opens up differently when it is heard rather than read.

## Global code injection

The following script adds `Audio` to the English navigation immediately after
`Project Map`. It does not change the Russian navigation.

```html
<script>
document.addEventListener('DOMContentLoaded', function () {
  var audioPath = '/en-audio-essays/';
  document.querySelectorAll('.en-menu-item a[href="/en-project-map/"]').forEach(function (projectLink) {
    var projectItem = projectLink.closest('li');
    if (!projectItem || projectItem.parentElement.querySelector('a[href="' + audioPath + '"]')) return;
    var audioItem = document.createElement('li');
    audioItem.className = 'en-menu-item';
    audioItem.innerHTML = '<a href="' + audioPath + '">Audio</a>';
    projectItem.insertAdjacentElement('afterend', audioItem);
  });

  var path = window.location.pathname;
  if (path === audioPath) {
    document.querySelectorAll('.ru-menu-item').forEach(function (item) { item.style.display = 'none'; });
    document.querySelectorAll('.en-menu-item').forEach(function (item) { item.style.display = ''; });
    document.querySelectorAll('.m-site-name').forEach(function (item) {
      item.textContent = '>_ AFTER LOGIN';
      item.setAttribute('href', '/en/');
    });
    document.documentElement.setAttribute('lang', 'en');
    document.querySelectorAll('.en-menu-item').forEach(function (item) {
      item.classList.toggle('nav-current', !!item.querySelector('a[href="' + audioPath + '"]'));
    });
  }
});
</script>
```

## Page header code injection

The page-level fallback keeps the English navigation visible after all theme
scripts have finished running.

```html
<script>
(function () {
  function showEnglishAudioNavigation() {
    if (window.location.pathname !== '/en-audio-essays/') return;
    document.querySelectorAll('.ru-menu-item').forEach(function (item) { item.style.display = 'none'; });
    document.querySelectorAll('.en-menu-item').forEach(function (item) { item.style.display = ''; });
    document.querySelectorAll('.m-site-name').forEach(function (item) {
      item.textContent = '>_ AFTER LOGIN';
      item.setAttribute('href', '/en/');
    });
    document.documentElement.setAttribute('lang', 'en');
    document.querySelectorAll('.en-menu-item').forEach(function (item) {
      item.classList.toggle('nav-current', !!item.querySelector('a[href="/en-audio-essays/"]'));
    });
  }
  window.addEventListener('load', showEnglishAudioNavigation);
  setTimeout(showEnglishAudioNavigation, 100);
})();
</script>
```

## Verification

On `/en-audio-essays/`, the rendered English navigation order is:

1. Home
2. Project Map
3. Audio
4. About the Project
5. About the Author
6. Contact
7. The Lounge
8. Русская версия

