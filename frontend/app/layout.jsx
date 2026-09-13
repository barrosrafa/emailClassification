import '../src/styles/global.css';

export const metadata = {
  title: 'maildesk — Caixa de entrada',
  description: 'Gerenciador seguro de e-mails Microsoft Graph'
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
