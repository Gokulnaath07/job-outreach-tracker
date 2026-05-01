import './globals.css';

export const metadata = {
  title: 'The Outreach Ledger',
  description: 'Live hiring contacts tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
