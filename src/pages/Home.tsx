import { Link } from "react-router-dom";
import {
    CheckCircle,
    Users,
    BarChart3,
    Mail,
    Shield,
    Clock,
    Zap,
    LogIn,
} from "lucide-react";

const Home = () => {
    const features = [
        {
            icon: <Users className="w-8 h-8 text-indigo-600" />,
            title: "Team Collaboration",
            description: "Seamlessly assign tasks to team members, track progress, and manage workloads with intelligent task distribution."
        },
        {
            icon: <BarChart3 className="w-8 h-8 text-indigo-600" />,
            title: "Performance Analytics",
            description: "Get comprehensive insights with automated reports, performance metrics, and data-driven analytics for better decision making."
        },
        {
            icon: <Clock className="w-8 h-8 text-indigo-600" />,
            title: "Revision Tracking",
            description: "Monitor task revisions, track changes, and maintain complete audit trails with detailed version history."
        },
        {
            icon: <Mail className="w-8 h-8 text-indigo-600" />,
            title: "Smart Notifications",
            description: "Stay updated with automated email notifications for task assignments, deadlines, and status changes."
        },
        {
            icon: <Shield className="w-8 h-8 text-indigo-600" />,
            title: "Secure Authentication",
            description: "Enterprise-grade security with Google OAuth integration ensuring safe and seamless access to your workspace."
        },
        {
            icon: <Zap className="w-8 h-8 text-indigo-600" />,
            title: "Automated Workflows",
            description: "Streamline processes with intelligent automation, reducing manual work and increasing productivity."
        }
    ];

    const benefits = [
        "Increase team productivity by up to 40%",
        "Reduce project delivery time significantly",
        "Improve task visibility and accountability",
        "Generate automated performance reports",
        "Streamline communication workflows"
    ];

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-3">


                            <div className="flex flex-col leading-tight">
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                    Task Management System
                                </h1>
                                <p className="text-sm text-slate-500 mt-1">
                                    Powered by Finamite Solutions LLP
                                </p>
                            </div>

                        </div>

                        <div className="flex items-center space-x-3">
                            <Link
                                to="/login"
                                className="inline-flex items-center text-gray-700 hover:text-indigo-600 px-4 py-2 rounded-lg font-medium transition-colors duration-200"
                            >
                                <LogIn className="w-4 h-4 mr-2" />
                                Login
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-8">
                            <div className="space-y-6">
                                <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                                    Smart Task &{' '}
                                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                        Workflow
                                    </span>{' '}
                                    Management
                                </h1>
                                <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                                    Transform your organization's productivity with TMS - the intelligent task management platform
                                    that streamlines workflows, tracks performance, and delivers actionable insights.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <Link
                                    to="/login"
                                    className="inline-flex items-center justify-center border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg font-semibold hover:border-indigo-600 hover:text-indigo-600 transition-all duration-200"
                                >
                                    Login to Continue
                                </Link>
                            </div>

                            <div className="flex items-center space-x-8 text-sm text-gray-600 gap-4">
                                <div className="flex items-center space-x-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span>Easy setup</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span>Secure platform</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative z-10 mt-4">
                                <img
                                    src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg"
                                    alt="Team collaboration and task management"
                                    className="w-full h-[500px] object-cover rounded-2xl shadow-2xl"
                                />
                            </div>
                            <div className="absolute -bottom-6 -right-6 w-full h-full bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl opacity-20"></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
                            Everything you need to manage tasks effectively
                        </h2>
                        <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                            From task assignment to performance tracking, TMS provides comprehensive tools
                            to streamline your workflow and boost productivity.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="bg-white p-8 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 group"
                            >
                                <div className="mb-6 transform group-hover:scale-110 transition-transform duration-200">
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-24 bg-gradient-to-br from-gray-50 to-indigo-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <img
                                src="https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg"
                                alt="Analytics and performance tracking dashboard"
                                className="w-full h-[500px] object-cover rounded-2xl shadow-xl"
                            />
                        </div>
                        <div className="space-y-8">
                            <div className="space-y-4 ml-10">
                                <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mt-6">
                                    Measurable Results for Your Organization
                                </h2>
                                <p className="text-xl text-gray-600 leading-relaxed">
                                    Join thousands of organizations that have transformed their productivity with TMS.
                                </p>
                            </div>

                            <div className="space-y-5">
                                {benefits.map((benefit, index) => (
                                    <div key={index} className="flex items-center space-x-4">
                                        <div className="w-6 h-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                                            <CheckCircle className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="text-gray-700 font-medium text-lg">{benefit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-gradient-to-r from-indigo-600 to-purple-600">
                <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
                    <div className="space-y-8">
                        <h2 className="text-4xl lg:text-5xl font-bold text-white">
                            Ready to transform your workflow?
                        </h2>
                        <p className="text-xl text-indigo-100 leading-relaxed max-w-2xl mx-auto">
                            Join thousands of organizations using TMS to streamline their task management
                            and boost productivity. Get started today.
                        </p>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3">

                                <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                                    <CheckCircle className="w-6 h-6 text-white" />
                                </div>

                                <div className="flex flex-col">
                                    <h3 className="text-2xl font-bold">
                                        TMS (Task Management System)
                                    </h3>
                                    <p className="text-sm text-slate-500">
                                        Powered by Finamite Solutions LLP
                                    </p>
                                </div>

                            </div>

                            <p className="text-gray-400 text-lg leading-relaxed">
                                Smart task management for modern organizations.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-6 text-lg">Support</h4>
                            <ul className="space-y-3 text-gray-400">
                                Finamite Solutions LLP<br />
                                Email: info@finamite.in<br />
                                Website: https://finamite.in<br />
                                Company Address : 3614, SECTOR 32A Urban Estate LUDHIANA, Punjab, India - 141010
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                        <p className="text-gray-400 text-sm">
                            © 2026 Finamite Solutions LLP. All rights reserved.
                        </p>
                        <div className="flex space-x-6 mt-4 md:mt-0">
                            <Link to="/privacy-policy" className="text-gray-400 hover:text-white text-sm transition-colors">
                                Privacy Policy
                            </Link>
                            <Link to="/terms-and-conditions" className="text-gray-400 hover:text-white text-sm transition-colors">
                                Terms & Conditions
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Home;