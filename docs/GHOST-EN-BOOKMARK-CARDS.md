# English bookmark cards in Ghost

Production state recorded on 2026-09-15.

## Stored card metadata

The English `Project Map` page (`https://milenin.pro/en-project-map/`) contains
20 Ghost bookmark cards. Their stored metadata was normalized to:

```text
publisher: >_ AFTER LOGIN
author: Peter Milenin
```

Only these two metadata fields were replaced. Every card retained its original
URL, title, description, icon and thumbnail.

Verification after publishing:

- 20 visible bookmark cards in the Ghost editor;
- 20 cards with the English publisher and author after reloading the editor;
- 20 cards with the same English values on the public page;
- no card with the Russian publisher or author remained on that page.

## Site footer code injection

Ghost bookmark cards cache metadata at insertion time. Changing a post author
does not update cards that already exist. The following safeguard localizes
publisher and author when a bookmark card is rendered on an English URL. It is
stored in Ghost Admin → Settings → Code injection → Site footer.

```html
<script>
(function () {
  function localizeEnglishBookmarks() {
    var path = window.location.pathname;
    var isEnglish = path === '/en/' || path.indexOf('/en/') === 0 || path.indexOf('/en-') === 0;
    if (!isEnglish) return;

    document.querySelectorAll('.kg-bookmark-author').forEach(function (item) {
      item.textContent = '>_ AFTER LOGIN';
    });
    document.querySelectorAll('.kg-bookmark-publisher').forEach(function (item) {
      item.textContent = 'Peter Milenin';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', localizeEnglishBookmarks);
  } else {
    localizeEnglishBookmarks();
  }
})();
</script>
```

## Language boundary

The script runs only when the path is exactly `/en/`, begins with `/en/`, or
begins with `/en-`. Russian URLs do not match these conditions and retain:

```text
publisher: >_ ПОСЛЕ ЛОГИНА
author: Пётр Миленин
```

## Restore check

After restoring Ghost:

1. open `Project Map` in the Ghost editor and confirm all 20 stored cards use
   the English publisher and author;
2. open `/en-project-map/` and confirm the rendered values;
3. open `/karta-proekta/` and confirm its Russian values remain unchanged;
4. verify that the Site footer code injection matches the canonical copy above.
