import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./operations.css";

export const metadata: Metadata = {
  title: "Dashboard NEO | Produção",
  description: "Acompanhamento de vendas e metas da produção NEO.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
