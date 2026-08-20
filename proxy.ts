import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(
  process.env.VERCEL_ENV === "production"
    ? { frontendApiProxy: { enabled: true } }
    : {},
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
