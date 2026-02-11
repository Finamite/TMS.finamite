import { Link } from "react-router-dom";

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-10">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Terms & Conditions
          </h1>
          <p className="text-gray-500 mt-2">
            TMS – Task Management System <br />
            Operated by <strong>Finamite Solutions LLP</strong><br />
            Last updated Date: 11th february 2026
          </p>
        </div>

        <section className="space-y-8 text-gray-700">

          <div>
            <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>
              These Terms & Conditions govern your access to and use of the
              TMS (Task Management System) platform operated by 
              <strong> Finamite Solutions LLP</strong>.
            </p>
            <p className="mt-2">
              By accessing or using TMS, you agree to comply with and be bound
              by these Terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">2. Description of Service</h2>
            <p>
              TMS is a web-based task management platform developed and
              maintained by <strong>Finamite Solutions LLP</strong>.
            </p>
            <p className="mt-2">
              The platform provides features including task creation,
              task assignment, revision tracking, workflow monitoring,
              reporting, and automated email notifications.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">3. User Responsibilities</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Provide accurate and complete information</li>
              <li>Maintain confidentiality of login credentials</li>
              <li>Use the platform for lawful purposes only</li>
              <li>Not attempt unauthorized system access</li>
              <li>Not upload malicious or harmful content</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">4. Email Notifications</h2>
            <p>
              By using TMS, users agree to receive system-generated emails
              related to:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Task assignments</li>
              <li>Task revisions</li>
              <li>Task completion confirmations</li>
              <li>Automated reports</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">5. Intellectual Property</h2>
            <p>
              All software, content, branding, and features of TMS are the
              exclusive property of <strong>Finamite Solutions LLP</strong>.
            </p>
            <p className="mt-2">
              Unauthorized copying, modification, or redistribution is strictly prohibited.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">6. Account Suspension or Termination</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> reserves the right to suspend
              or terminate user accounts that violate these Terms or misuse
              the platform.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">7. Limitation of Liability</h2>
            <p>
              TMS is provided on an "as is" and "as available" basis.
            </p>
            <p className="mt-2">
              <strong>Finamite Solutions LLP</strong> shall not be liable for
              indirect, incidental, or consequential damages arising from
              the use or inability to use the platform.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">8. Governing Law</h2>
            <p>
              These Terms shall be governed by the applicable laws of India.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">9. Modifications</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> reserves the right to update
              or modify these Terms at any time.
              Continued use of TMS constitutes acceptance of changes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">10. Contact Information</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> <br />
              Email: info@finamite.in <br />
              Website: https://finamite.in<br />
              Company Address : 3614, SECTOR 32A Urban Estate LUDHIANA, Punjab, India - 141010
            </p>
          </div>

        </section>

        <div className="mt-10 border-t pt-6 text-sm text-gray-500">
          <Link to="/" className="text-blue-600 hover:underline">
            ← Back to Login
          </Link>
        </div>

      </div>
    </div>
  );
};

export default TermsAndConditions;
