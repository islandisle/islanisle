// Section 11: "Multi-language UI for Tourist accounts only (English,
// Chinese, Italian, Spanish, extensible)." The language selector at signup
// (Signup.jsx's LanguageStep) already captured and stored a choice, but
// nothing was ever actually translated and there was no way to change it
// later — this is the real translation layer, plus Profile.jsx's "change
// it later" option the signup step already promised.
//
// Deliberately a small in-house key/lookup system rather than pulling in
// an i18n library — no network access to `npm install` a new dependency in
// this environment, and the pattern (a translations table + a React
// context exposing t()) is the same shape a library would give, just
// self-contained.
//
// Scope, disclosed rather than silently partial: this covers Home.jsx (the
// app's actual landing page — see App.jsx) end to end, plus the shared
// bits (business type names, common action verbs, the language picker
// itself) reused elsewhere. It does NOT cover every string in every page —
// ListingDetail's checkout forms, MyActivity, Transfers, Trips, Support,
// etc. still render in English regardless of the selected language. Full
// coverage is a large, mechanical follow-up, not a design problem.

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { updateMyLanguage } from './api/client';

// Same small helper duplicated in Home.jsx/ListingDetail.jsx/Profile.jsx —
// no shared module for it yet.
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('atollisle_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: 'Chinese' },
  { code: 'it', label: 'Italian' },
  { code: 'es', label: 'Spanish' },
];

const TRANSLATIONS = {
  en: {
    'common.loading': 'Loading…',
    'common.book_now': 'Book now',
    'common.buy_now': 'Buy now',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.go': 'Go',
    'home.staying_on': 'Staying on {island}',
    'home.whats_on': "What's on {island}",
    'home.island_picker_placeholder': 'Select an island…',
    'home.island_search_placeholder': 'Search island or atoll',
    'home.filter_all': 'All',
    'home.accessibility_filters': 'Accessibility filters',
    'home.empty_state': 'No listings on {island} yet — check back soon.',
    'home.arriving_by_air': 'Arriving by air? Find a speedboat transfer →',
    'home.local_price_suffix': 'local price',
    'home.closed': 'Closed',
    'home.search_placeholder': 'Search listings, businesses…',
    'home.search_no_results': 'No matches for "{query}".',
    'hint.search': 'New: search listings and businesses across every island at once.',
    'hint.chat': 'Tip: message the business directly here with questions before you book.',
    'home.local_guide_link': 'Local guide: events, visa & customs, tipping →',
    'home.dietary_filters': 'Dietary options',
    'business_types.guesthouse': 'Guesthouse',
    'business_types.restaurant': 'Restaurant',
    'business_types.excursion': 'Excursion',
    'business_types.speedboat': 'Speedboat',
    'business_types.shop': 'Shop',
    'profile.language': 'Language',
    'nav.profile': 'Profile',
  },
  zh: {
    'common.loading': '加载中…',
    'common.book_now': '立即预订',
    'common.buy_now': '立即购买',
    'common.cancel': '取消',
    'common.close': '关闭',
    'common.search': '搜索',
    'common.go': '前往',
    'home.staying_on': '当前入住岛屿：{island}',
    'home.whats_on': '{island} 的推荐',
    'home.island_picker_placeholder': '选择一个岛屿…',
    'home.island_search_placeholder': '搜索岛屿或环礁',
    'home.filter_all': '全部',
    'home.accessibility_filters': '无障碍筛选',
    'home.empty_state': '{island} 暂无相关信息 — 请稍后再来查看。',
    'home.arriving_by_air': '乘飞机抵达？查找快艇接送 →',
    'home.local_price_suffix': '本地价格',
    'home.closed': '已关闭',
    'home.search_placeholder': '搜索房源或商家…',
    'home.search_no_results': '没有找到与“{query}”匹配的结果。',
    'hint.search': '新功能：一次搜索所有岛屿的房源和商家。',
    'hint.chat': '提示：预订前可以直接在这里向商家提问。',
    'home.local_guide_link': '本地指南：活动、签证与海关、小费 →',
    'home.dietary_filters': '饮食选项',
    'business_types.guesthouse': '民宿',
    'business_types.restaurant': '餐厅',
    'business_types.excursion': '短途游览',
    'business_types.speedboat': '快艇',
    'business_types.shop': '商店',
    'profile.language': '语言',
    'nav.profile': '个人资料',
  },
  it: {
    'common.loading': 'Caricamento…',
    'common.book_now': 'Prenota ora',
    'common.buy_now': 'Acquista ora',
    'common.cancel': 'Annulla',
    'common.close': 'Chiudi',
    'common.search': 'Cerca',
    'common.go': 'Vai',
    'home.staying_on': 'Soggiorno a {island}',
    'home.whats_on': 'Cosa c’è a {island}',
    'home.island_picker_placeholder': 'Seleziona un’isola…',
    'home.island_search_placeholder': 'Cerca isola o atollo',
    'home.filter_all': 'Tutti',
    'home.accessibility_filters': 'Filtri di accessibilità',
    'home.empty_state': 'Ancora nessuna struttura a {island} — torna a controllare presto.',
    'home.arriving_by_air': 'Arrivi in aereo? Trova un trasferimento in motoscafo →',
    'home.local_price_suffix': 'prezzo locale',
    'home.closed': 'Chiuso',
    'home.search_placeholder': 'Cerca strutture o attività…',
    'home.search_no_results': 'Nessun risultato per "{query}".',
    'hint.search': 'Novità: cerca strutture e attività su tutte le isole insieme.',
    'hint.chat': 'Suggerimento: scrivi qui direttamente alla struttura prima di prenotare.',
    'home.local_guide_link': 'Guida locale: eventi, visto e dogana, mance →',
    'home.dietary_filters': 'Opzioni alimentari',
    'business_types.guesthouse': 'Guesthouse',
    'business_types.restaurant': 'Ristorante',
    'business_types.excursion': 'Escursione',
    'business_types.speedboat': 'Motoscafo',
    'business_types.shop': 'Negozio',
    'profile.language': 'Lingua',
    'nav.profile': 'Profilo',
  },
  es: {
    'common.loading': 'Cargando…',
    'common.book_now': 'Reservar ahora',
    'common.buy_now': 'Comprar ahora',
    'common.cancel': 'Cancelar',
    'common.close': 'Cerrar',
    'common.search': 'Buscar',
    'common.go': 'Ir',
    'home.staying_on': 'Alojado en {island}',
    'home.whats_on': 'Qué hay en {island}',
    'home.island_picker_placeholder': 'Selecciona una isla…',
    'home.island_search_placeholder': 'Buscar isla o atolón',
    'home.filter_all': 'Todos',
    'home.accessibility_filters': 'Filtros de accesibilidad',
    'home.empty_state': 'Todavía no hay nada en {island} — vuelve pronto.',
    'home.arriving_by_air': '¿Llegas en avión? Busca un traslado en lancha rápida →',
    'home.local_price_suffix': 'precio local',
    'home.closed': 'Cerrado',
    'home.search_placeholder': 'Buscar alojamientos o negocios…',
    'home.search_no_results': 'Sin resultados para "{query}".',
    'hint.search': 'Novedad: busca alojamientos y negocios en todas las islas a la vez.',
    'hint.chat': 'Consejo: escribe aquí directamente al negocio antes de reservar.',
    'home.local_guide_link': 'Guía local: eventos, visado y aduanas, propinas →',
    'home.dietary_filters': 'Opciones dietéticas',
    'business_types.guesthouse': 'Casa de huéspedes',
    'business_types.restaurant': 'Restaurante',
    'business_types.excursion': 'Excursión',
    'business_types.speedboat': 'Lancha rápida',
    'business_types.shop': 'Tienda',
    'profile.language': 'Idioma',
    'nav.profile': 'Perfil',
  },
};

const STORAGE_KEY = 'atollisle_language';

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return TRANSLATIONS[stored] ? stored : 'en';
  } catch {
    return 'en';
  }
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

const LanguageContext = createContext(null);

// Local accounts stay English-only (Section 11) — LanguageProvider is only
// ever mounted inside frontend-tourist, which Local accounts also use, so
// the picker itself is hidden for a Local user (see LanguagePicker below)
// rather than gated here — the context still needs to exist so t() doesn't
// throw for a Local account rendering the same Home.jsx.
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  const setLanguage = useCallback((code) => {
    if (!TRANSLATIONS[code]) return;
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore — worst case the choice doesn't persist across visits
    }
    if (localStorage.getItem('atollisle_token')) {
      updateMyLanguage(code).catch(() => {}); // best-effort — UI already reflects the change either way
    }
  }, []);

  // Pick up the account's own stored language on login, so switching
  // accounts on the same device doesn't keep a previous account's choice.
  useEffect(() => {
    const user = getCurrentUser();
    if (user?.language && TRANSLATIONS[user.language] && user.language !== language) {
      setLanguageState(user.language);
      try { localStorage.setItem(STORAGE_KEY, user.language); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useCallback((key, vars) => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    const template = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    return interpolate(template, vars);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Defensive fallback (e.g. a component rendered in isolation/tests) —
    // never throws, just behaves as English with a no-op setter.
    return { language: 'en', setLanguage: () => {}, t: (key, vars) => interpolate(TRANSLATIONS.en[key] ?? key, vars) };
  }
  return ctx;
}
