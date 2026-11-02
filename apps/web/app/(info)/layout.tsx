export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed [&_h1]:text-4xl [&_h1]:font-semibold [&_h1]:text-maroon [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-maroon [&_li]:ml-5 [&_li]:list-disc [&_a]:text-maroon [&_a]:underline">
      {children}
    </article>
  );
}
