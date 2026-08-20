import { clerkMiddleware } from "@clerk/nextjs/server";

const usesProductionClerk =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") ??
  false;

export default clerkMiddleware(
  process.env.VERCEL_ENV === "production" && usesProductionClerk
    ? { frontendApiProxy: { enabled: true } }
    : {},
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
