(function () {
  const API = 'api/announcement.json';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function reveal() {
    const nodes = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    nodes.forEach((n) => io.observe(n));
  }

  function bindNav() {
    const header = qs('.site-header');
    const onScroll = () => {
      if (!header) return;
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function pickField(data, zhKey, enKey, flatKey) {
    const lang = window.AischI18n.getLang();
    if (lang === 'zh') {
      return (data[zhKey] || data[flatKey] || '').trim();
    }
    return (data[enKey] || data[flatKey] || '').trim();
  }

  async function loadAnnouncement() {
    const root = qs('#announcement-panel');
    if (!root) return;

    const titleEl = qs('[data-ann-title]', root);
    const bodyEl = qs('[data-ann-body]', root);
    const imgEl = qs('[data-ann-image]', root);
    const metaEl = qs('[data-ann-meta]', root);
    const linkEl = qs('[data-ann-link]', root);
    const statusEl = qs('[data-ann-status]', root);

    const render = (data) => {
      const title = pickField(data, 'title_zh', 'title_en', 'title');
      const body = pickField(data, 'body_zh', 'body_en', 'body') || (data.text || '');
      const imageUrl = (data.imageUrl || data.image_url || '').trim();
      const linkUrl = (data.linkUrl || data.link_url || '').trim();
      const publishedAt = (data.publishedAt || data.published_at || '').trim();

      if (statusEl) statusEl.hidden = true;
      if (titleEl) titleEl.textContent = title || '—';
      if (bodyEl) bodyEl.textContent = body || '';
      if (metaEl) metaEl.textContent = publishedAt;
      if (imgEl) {
        if (imageUrl) {
          imgEl.src = imageUrl;
          imgEl.alt = title || 'Announcement';
          imgEl.hidden = false;
        } else {
          imgEl.hidden = true;
        }
      }
      if (linkEl) {
        if (linkUrl) {
          linkEl.href = linkUrl;
          linkEl.hidden = false;
        } else {
          linkEl.hidden = true;
        }
      }
    };

    try {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = window.AischI18n.t('ann.loading');
      }
      const resp = await fetch(API, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      root._annData = data;
      render(data);
    } catch (_e) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = window.AischI18n.t('ann.error');
      }
    }

    document.addEventListener('i18n:change', () => {
      if (root._annData) render(root._annData);
      else if (statusEl && !statusEl.hidden) {
        statusEl.textContent = window.AischI18n.t(
          statusEl.textContent.includes('unavailable') || statusEl.textContent.includes('无法')
            ? 'ann.error'
            : 'ann.loading'
        );
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.AischI18n.init();
    bindNav();
    reveal();
    loadAnnouncement();
  });
})();
