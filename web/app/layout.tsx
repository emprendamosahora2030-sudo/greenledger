import { Providers } from "./providers";

export const metadata = { title: "GreenLedger · Credenciales verificables" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "Georgia, serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
