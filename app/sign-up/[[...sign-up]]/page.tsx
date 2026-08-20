import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-page__intro">
        <span className="panel-kicker">HEATMAN TEAMS</span>
        <h1>Create your delivery-company workspace.</h1>
        <p>
          Start with a free company account, then invite dispatchers and riders
          into one shared heat-safety workspace.
        </p>
      </div>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </main>
  );
}
