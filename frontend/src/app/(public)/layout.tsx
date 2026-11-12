import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { MobileTabBar } from '../../components/layout/MobileTabBar';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
