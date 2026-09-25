(() => {
  function normalizeBreaks(root) {
    const elements = [];

    if (root instanceof Element && root.matches('[data-translation-message-id]')) {
      elements.push(root);
    }

    if (root.querySelectorAll) {
      elements.push(...root.querySelectorAll('[data-translation-message-id]'));
    }

    elements.forEach(element => {
      element.querySelectorAll('br').forEach(br => {
        br.replaceWith(document.createTextNode('\n'));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeBreaks(document);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type !== 'childList') return;
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) normalizeBreaks(node);
        });

        if (mutation.target instanceof Element && mutation.target.matches('[data-translation-message-id]')) {
          normalizeBreaks(mutation.target);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
