import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <Header />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
      <Footer />
    </div>
  );
}
