import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-page__intro">
        <span className="panel-kicker">HEATMAN TEAMS</span>
        <h1>Sign in to your fleet heat workspace.</h1>
        <p>
          Rider navigation stays public. Company accounts unlock the dispatcher
          workflow for your delivery team.
        </p>
      </div>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </main>
  );
}
