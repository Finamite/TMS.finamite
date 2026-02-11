import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-10">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Privacy Policy
          </h1>
          <p className="text-gray-500 mt-2">
            TMS – Task Management System <br />
            Operated by <strong>Finamite Solutions LLP</strong><br />
            Last updated Date: 11th february 2026
          </p>
        </div>

        <section className="space-y-8 text-gray-700">

          <div>
            <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
            <p>
              This Privacy Policy explains how <strong>Finamite Solutions LLP </strong>
               collects, uses, stores, and protects personal information when you
              access or use TMS (Task Management System).
            </p>
            <p className="mt-2">
              By using TMS, you agree to the collection and use of information
              in accordance with this policy.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Full name</li>
              <li>Email address</li>
              <li>Organization name and role</li>
              <li>Task assignments and completion data</li>
              <li>Revision history and logs</li>
              <li>System usage activity</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">3. Google Sign-In Information</h2>
            <p>
              If you sign in using Google OAuth, TMS accesses only:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Basic profile information (name, email, profile image)</li>
            </ul>
            <p className="mt-2">
              <strong>Finamite Solutions LLP</strong> does NOT access,
              read, or store Gmail messages, Google Drive files, contacts,
              or any other private Google data.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">4. How We Use Your Information</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Create and manage tasks</li>
              <li>Assign tasks to team members</li>
              <li>Track task progress and revisions</li>
              <li>Send task-related notifications</li>
              <li>Generate automated reports</li>
              <li>Improve system functionality</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">5. Email Communication</h2>
            <p>
              TMS uses Google email services strictly for transactional purposes,
              including:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Task assignment notifications</li>
              <li>Revision requests</li>
              <li>Completion confirmations</li>
              <li>Automated reporting emails</li>
            </ul>
            <p className="mt-2">
              We do not send promotional or marketing emails.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">6. Data Storage & Security</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> implements appropriate
              technical and organizational measures to protect personal data
              from unauthorized access, alteration, disclosure, or destruction.
            </p>
            <p className="mt-2">
              Access to data is restricted to authorized users within the
              respective organization.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">7. Data Retention</h2>
            <p>
              We retain personal data as long as the organization actively
              uses TMS. Users may request deletion of their data by contacting us.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">8. Data Sharing</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> does not sell, rent,
              or share personal information with third parties.
              Data is used solely to provide and improve TMS services.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">9. User Rights</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Request access to stored personal data</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">10. Changes to This Policy</h2>
            <p>
              <strong>Finamite Solutions LLP</strong> may update this Privacy
              Policy from time to time. Continued use of TMS after changes
              indicates acceptance of the updated policy.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">11. Contact Information</h2>
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

export default PrivacyPolicy;
