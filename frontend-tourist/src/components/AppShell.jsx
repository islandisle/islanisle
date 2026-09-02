import { Outlet, Link, useLocation } from 'react-router-dom';
import NavMenu from './NavMenu';
import { buildNavMenuItems } from '../navConfig';
import { runSOS, reportSOSToast } from '../sos';
import { isMaldivesNight } from '../maldivesTime';
import { useLanguage } from '../i18n';
import { useToast } from './Toast';

// Fix #3 — the hamburger menu used to live only in Home.jsx's header, so
// every other route (Messages, booking details, settings, …) had no way to
// open the main navigation. This is the shared shell every non-auth route
// renders inside: one sticky top bar, same wordmark + ☰ in the same place
// on every screen, with <Outlet/> for the page below it.
//
// Home is the one route NOT wrapped in this shell — it keeps its richer
// weather header, which already carries the same menu (built from the same
// navConfig) plus the notification bell and live conditions.
export default function AppShell() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const isNight = isMaldivesNight();

  // Inside the Go Social section the same shared header rebrands to
  // "Socisle"; everywhere else it stays "Atoll Isle". Label swap only —
  // same shell, same layout.
  const inSocial = useLocation().pathname.startsWith('/social');
  const wordmark = inSocial ? 'Socisle' : 'Atoll Isle';

  const menuItems = buildNavMenuItems({
    onSOS: () => runSOS({ report: reportSOSToast(showToast) }),
  });

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 150,
          background: isNight ? 'var(--night-sky)' : 'var(--lagoon)',
          color: '#fff',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to={inSocial ? '/social' : '/'}
            style={{ color: '#fff', fontWeight: 500, fontSize: 16, textDecoration: 'none' }}
          >
            {wordmark}
          </Link>
          <NavMenu items={menuItems} label={t('nav.menu')} />
        </div>
      </header>

      <Outlet />
    </>
  );
}
