import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search, Mail, Phone, MessageCircle, HelpCircle, ChevronDown, ChevronRight, Settings, BarChart3, CheckSquare, Filter, CreditCard as Edit3, UserPlus, Bell, Trash2, RotateCcw, Shield, Clock, Target, FileText, Star } from 'lucide-react';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  roles: string[];
  icon: React.ReactNode;
  tags: string[];
}

const ThemeCard = ({ children, className = "", variant = "default", hover = true }: {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'elevated' | 'bordered';
  hover?: boolean;
}) => {
  const baseClasses = "relative transition-all duration-300 ease-out";

  const variants = {
    default: `rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_18px_45px_rgba(15,23,42,0.06)]`,
    glass: `rounded-3xl bg-[var(--color-surface)]/95 backdrop-blur-xl border border-[var(--color-border)] shadow-[0_18px_45px_rgba(15,23,42,0.08)]`,
    elevated: `rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_24px_70px_rgba(15,23,42,0.1)]`,
    bordered: `rounded-3xl bg-[var(--color-background)] border border-[var(--color-border)] shadow-[0_16px_40px_rgba(15,23,42,0.05)]`
  };

  const hoverClasses = hover ? "hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.1)]" : "";

  return (
    <div className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
};

const WhatsAppIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
  >
    <path d="M19.05 4.95A9.92 9.92 0 0 0 12.01 2C6.49 2 2 6.49 2 12a9.94 9.94 0 0 0 1.34 4.99L2 22l5.16-1.35A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10 0-2.66-1.04-5.16-2.95-7.05Zm-7.04 15.35a8.22 8.22 0 0 1-4.2-1.15l-.3-.18-3.06.8.82-2.98-.2-.31A8.2 8.2 0 1 1 12.01 20.3Zm4.77-6.52c-.26-.13-1.55-.77-1.79-.86-.24-.09-.42-.13-.6.13-.17.26-.69.86-.84 1.04-.15.17-.31.2-.57.07-.26-.13-1.09-.4-2.08-1.27-.77-.69-1.29-1.53-1.44-1.79-.15-.26-.02-.4.11-.53.11-.11.26-.31.39-.46.13-.15.17-.26.26-.44.09-.17.04-.33-.02-.46-.06-.13-.6-1.45-.82-1.98-.22-.53-.44-.46-.6-.47-.15-.01-.33-.01-.51-.01-.18 0-.46.07-.7.33-.24.26-.92.9-.92 2.2s.95 2.55 1.08 2.73c.13.17 1.86 2.84 4.51 3.98.63.27 1.12.43 1.51.55.63.2 1.2.17 1.65.1.5-.08 1.55-.63 1.77-1.24.22-.61.22-1.13.16-1.24-.06-.11-.24-.17-.5-.3Z" />
  </svg>
);


const HelpSupport: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [showMobileTopics, setShowMobileTopics] = useState(false);

  const userName = user?.username || "User";
  const companyName = user?.company?.companyName || "Company";

  const emailSubject = encodeURIComponent(
    `Support Request from ${userName} (${companyName})`
  );

  const supportNumberDisplay = "+91 99886 00362";   // UI only
  const supportNumberDial = "+919988600362";

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const faqData: FAQItem[] = [
    // Admin/Manager FAQs
    {
      id: '1',
      question: 'How do I assign tasks to team members?',
      answer: 'Navigate to the "Assign Task" page from the main menu. Select the team member, choose task type (one-time, daily, weekly, monthly, quarterly, or yearly), set the title, description, priority, and due date. Click "Assign Task" to create and assign the task to the selected user.',
      category: 'task-management',
      roles: ['admin', 'manager'],
      icon: <UserPlus size={20} />,
      tags: ['assign', 'task', 'team', 'management']
    },
    {
      id: '2',
      question: 'How do I edit existing tasks?',
      answer: 'For single tasks: Go to "Master Tasks" page, find the task, and click the "Edit" button in the action column. For recurring tasks: Go to "Master Recurring Tasks" page and use the edit option. You can modify the task title, description, shift it to another user, and for one-time tasks, you can also change the due date.',
      category: 'task-management',
      roles: ['admin', 'manager'],
      icon: <Edit3 size={20} />,
      tags: ['edit', 'modify', 'task', 'recurring', 'single']
    },
    {
      id: '3',
      question: 'How do I check team performance?',
      answer: 'Access the "Performance" section from the main menu to view comprehensive team analytics. You can see individual team member completion rates, task distribution, on-time completion statistics, and performance trends over time. Use filters to analyze performance by date ranges or specific team members.',
      category: 'analytics',
      roles: ['admin', 'manager'],
      icon: <BarChart3 size={20} />,
      tags: ['performance', 'analytics', 'team', 'statistics']
    },
    {
      id: '4',
      question: 'How do I use the team chat feature?',
      answer: 'Navigate to the "Chat" section to communicate with team members. You can send direct messages to individual team members. The chat supports real-time messaging and helps coordinate team activities and task discussions.',
      category: 'communication',
      roles: ['admin', 'manager'],
      icon: <MessageCircle size={20} />,
      tags: ['chat', 'communication', 'team', 'messaging']
    },
    {
      id: '5',
      question: 'How do I configure revision settings?',
      answer: 'Go to "Settings" and navigate to the "Revision" section. Here you can: 1) Set the revision limit for tasks, 2) Configure how many days after task creation revisions are allowed, 3) Restrict teams from making revisions on high-priority tasks, 4) Set impact on scoring for revisions.',
      category: 'settings',
      roles: ['admin', 'manager'],
      icon: <Settings size={20} />,
      tags: ['revision', 'settings', 'limits', 'priority']
    },
    {
      id: '6',
      question: 'How do I set up email notifications?',
      answer: 'In "Settings" under "Email Settings": 1) Connect with Google for email integration, 2) Configure automatic emails for task assignment, task revision, and task completion, 3) Set up automated reports to be sent via email, 4) Choose between morning and evening report schedules.',
      category: 'settings',
      roles: ['admin', 'manager'],
      icon: <Bell size={20} />,
      tags: ['email', 'notifications', 'google', 'automated', 'reports']
    },
    {
      id: '7',
      question: 'How do I manage task completion settings?',
      answer: 'In "Settings" under "Task Completion": 1) Set permissions for users to add attachments to completed tasks, 2) Make attachments mandatory for certain task types, 3) Configure requirement for remarks/comments on task completion, 4) Set up validation rules for task submission.',
      category: 'settings',
      roles: ['admin', 'manager'],
      icon: <CheckSquare size={20} />,
      tags: ['completion', 'attachments', 'remarks', 'validation']
    },
    {
      id: '8',
      question: 'How do I configure the recycle bin settings?',
      answer: 'Navigate to "Settings" > "Recycle Bin Settings". Here you can configure how many days deleted items remain in the recycle bin before being permanently deleted. This helps prevent accidental data loss while keeping the system clean.',
      category: 'settings',
      roles: ['admin', 'manager'],
      icon: <Trash2 size={20} />,
      tags: ['recycle', 'bin', 'deletion', 'recovery']
    },
    {
      id: '9',
      question: 'How do I use filters to search data?',
      answer: 'Most pages include comprehensive filter options: 1) Use date range filters to narrow down time periods, 2) Filter by task status (pending, completed, overdue), 3) Filter by user/assignee, 4) Filter by task type (one-time, daily, weekly, etc.), 5) Use priority filters, 6) Apply multiple filters simultaneously for precise results.',
      category: 'navigation',
      roles: ['admin', 'manager'],
      icon: <Filter size={20} />,
      tags: ['filter', 'search', 'data', 'navigation']
    },

    // User FAQs
    {
      id: '10',
      question: 'How do I complete one-time tasks?',
      answer: 'Go to the "Pending Tasks" page to view all your pending one-time tasks. Click on a task to view details, add any required attachments or remarks, and click "Mark as Complete". Ensure you fulfill any completion requirements set by your administrator.',
      category: 'task-completion',
      roles: ['employee', 'manager', 'admin'],
      icon: <Target size={20} />,
      tags: ['complete', 'one-time', 'pending', 'tasks']
    },
    {
      id: '11',
      question: 'How do I complete recurring tasks?',
      answer: 'Navigate to "Pending Recurring Tasks" page. You\'ll see tabs for "Daily Tasks" and "Cyclic Tasks" (weekly, monthly, quarterly, yearly). Select the appropriate tab, find your task, and mark it as complete. Recurring tasks will automatically generate new instances based on their schedule.',
      category: 'task-completion',
      roles: ['employee', 'manager', 'admin'],
      icon: <RotateCcw size={20} />,
      tags: ['recurring', 'daily', 'cyclic', 'weekly', 'monthly']
    },
    {
      id: '12',
      question: 'How do I use filters to find my tasks?',
      answer: 'Use the filter options available on task pages to: 1) Filter by due date or date range, 2) Filter by task priority (high, normal), 3) Filter by task status, 4) Filter by task type, 5) Use the search bar to find tasks by title or description. Combine multiple filters for better results.',
      category: 'navigation',
      roles: ['employee', 'manager', 'admin'],
      icon: <Search size={20} />,
      tags: ['filter', 'search', 'tasks', 'priority', 'date']
    },

    // General FAQs
    {
      id: '13',
      question: 'How do I change password?',
      answer: 'Open the Admin Panel, select the user whose password you want to change, click the “Change Password” icon, enter the new password, and submit. The password will be updated successfully.',

      category: 'account',
      roles: ['manager', 'admin'],
      icon: <Shield size={20} />,
      tags: ['password', 'security', 'account', 'profile']
    },
    {
      id: '14',
      question: 'What are the different task priorities and what do they mean?',
      answer: 'Task priorities help organize work importance: 1) High Priority - Urgent tasks requiring immediate attention, 2) Normal Priority - Tasks that can be completed when time permits. High priority tasks may have restrictions on revisions and affect performance scoring more significantly.',
      category: 'task-management',
      roles: ['employee', 'manager', 'admin'],
      icon: <Star size={20} />,
      tags: ['priority', 'high', 'medium', 'low', 'importance']
    },
    {
      id: '15',
      question: 'How do task deadlines and overdue status work?',
      answer: 'Tasks automatically become "overdue" when the due date passes without completion. Overdue tasks are highlighted in red and affect your performance metrics. For recurring tasks, each instance has its own deadline based on the recurrence pattern (daily tasks due each day, weekly tasks due each week, etc.).',
      category: 'task-management',
      roles: ['employee', 'manager', 'admin'],
      icon: <Clock size={20} />,
      tags: ['deadline', 'overdue', 'due date', 'recurring']
    },
    {
      id: '16',
      question: 'How do I add attachments and remarks to completed tasks?',
      answer: 'When completing a task, you\'ll see options to add attachments and remarks if enabled by your administrator. Click "Add Attachment" to upload files (documents, images, etc.) and use the remarks field to provide additional context about task completion. Some tasks may require mandatory attachments or remarks.',
      category: 'task-completion',
      roles: ['employee', 'manager', 'admin'],
      icon: <FileText size={20} />,
      tags: ['attachments', 'remarks', 'completion', 'mandatory']
    },
  ];

  const categories = [
    { id: 'all', name: 'All Topics', icon: <HelpCircle size={16} /> },
    { id: 'task-management', name: 'Task Management', icon: <CheckSquare size={16} /> },
    { id: 'task-completion', name: 'Task Completion', icon: <Target size={16} /> },
    { id: 'settings', name: 'Settings', icon: <Settings size={16} /> },
    { id: 'analytics', name: 'Analytics', icon: <BarChart3 size={16} /> },
    { id: 'communication', name: 'Communication', icon: <MessageCircle size={16} /> },
    { id: 'navigation', name: 'Navigation', icon: <Search size={16} /> },
    { id: 'account', name: 'Account', icon: <Shield size={16} /> },
  ];

  const filteredFAQs = useMemo(() => {
    let filtered = faqData;

    // Filter by user role
    if (user?.role) {
      filtered = filtered.filter(faq => faq.roles.includes(user.role));
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(faq => faq.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(faq =>
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    return filtered;
  }, [searchTerm, selectedCategory, user?.role]);

  const getUserRoleDisplay = () => {
    if (user?.role === 'admin') return 'Administrator';
    if (user?.role === 'manager') return 'Manager';
    return 'Team Member';
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-2 sm:p-4 lg:p-6">
      <div className="w-full space-y-6">
        {/* Header */}
        <ThemeCard className="p-5 sm:p-6" variant="glass" hover={false}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-sm">
              <HelpCircle size={22} className="text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                Help & Support Center
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-textSecondary)]">
                Welcome, <span className="font-semibold text-[var(--color-primary)]">{user?.username}</span> ({getUserRoleDisplay()})!
                Find answers to your questions and get the help you need.
              </p>
            </div>
          </div>
        </ThemeCard>

        {/* Main Layout: Left Sidebar + Right Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left Sidebar - Contact Information */}
          <div className="space-y-6">
            <ThemeCard className="p-6" variant="default" hover={false}>
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Contact</p>
                  <h2 className="mt-1 text-xl font-semibold text-[var(--color-text)]">Contact Support</h2>
                </div>

                {/* EMAIL SUPPORT */}
                <div className="flex flex-col space-y-4">

                  {/* Left Side */}
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)]/10">
                      <Mail size={22} className="text-[var(--color-primary)]" />
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">Email Support</h3>
                      <a href="mailto:support@taskflow.com" className="font-semibold text-[var(--color-primary)] hover:underline">
                        info@finamite.in
                      </a>
                      <p className="mt-1 text-sm text-[var(--color-textSecondary)]">
                        We'll respond within 24 hours
                      </p>
                    </div>
                  </div>

                  {/* Button ALWAYS BELOW TEXT */}
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=info@finamite.in&su=${emailSubject}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-3 font-semibold text-white shadow-lg shadow-[rgba(59,130,246,0.18)] transition-all hover:brightness-105"
                  >
                    <Mail size={18} />
                    <span>Send Email</span>
                  </a>
                </div>
                 
                {(user?.role === 'admin' || user?.role === 'manager') && (
                <div className="my-2 border-t border-[var(--color-border)]"></div>
                )}
                {/* PHONE SUPPORT */}
                {(user?.role === 'admin' || user?.role === 'manager') && (
                <div className="flex flex-col space-y-4">

                  {/* Left Side */}
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-emerald-500/10">
                      <Phone size={22} className="text-emerald-600" />
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">Phone Support</h3>
                      <a
                        href={`tel:${supportNumberDial}`}
                        className="text-lg font-semibold text-emerald-600 hover:underline"
                      >
                        {supportNumberDisplay}
                      </a>
                      <p className="mt-1 text-sm text-[var(--color-textSecondary)]">
                        Mon–Sat, 10 AM – 6:30 PM IST
                      </p>
                    </div>
                  </div>

                  {/* Button ALWAYS BELOW TEXT */}

                  <a
                    href={
                      isMobile
                        ? "tel:+919988600362"
                        : "https://wa.me/919988600362"
                    }
                    target={!isMobile ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-700"
                  >
                    <WhatsAppIcon size={18} />
                    <span>{isMobile ? "Call Now" : "WhatsApp Support"}</span>
                  </a>

                </div>
                )}

              </div>
            </ThemeCard>
          </div>



          {/* Right Content - Search, Filter & FAQ */}
          <div className="min-w-0">
            <ThemeCard className="p-6" variant="glass" hover={false}>
              <div className="space-y-6">
                {/* Search Bar */}
                <div className="relative">
                  <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                  <input
                    type="text"
                    placeholder="Search for help topics, features, or questions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-4 pl-12 pr-6 text-[var(--color-text)] shadow-sm transition-all placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15"
                  />
                </div>

                {/* Categories */}
                <div className="hidden sm:flex flex-wrap gap-3">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${selectedCategory === category.id
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-lg shadow-[rgba(59,130,246,0.16)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5'
                        }`}
                    >
                      <div className={selectedCategory === category.id ? 'text-white' : 'text-[var(--color-primary)]'}>
                        {category.icon}
                      </div>
                      <span>{category.name}</span>
                    </button>
                  ))}
                </div>

                {/* ---------- MOBILE (COLLAPSIBLE) ---------- */}
                <div className="sm:hidden space-y-3">
                  {/* Header */}
                  <button
                    onClick={() => setShowMobileTopics(prev => !prev)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3"
                  >
                    <span className="font-semibold text-[var(--color-text)]">
                      All Topics
                    </span>

                    {showMobileTopics ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </button>

                  {/* Expandable list */}
                  {showMobileTopics && (
                    <div className="flex flex-col gap-2">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => {
                            setSelectedCategory(category.id);
                            setShowMobileTopics(false); // auto close
                          }}
                          className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-all ${selectedCategory === category.id
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
                            }`}
                        >
                          <span className="font-medium">{category.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Results Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-[var(--color-text)]">
                    {selectedCategory === 'all' ? 'All Help Topics' : categories.find(c => c.id === selectedCategory)?.name}
                  </h2>
                  <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)]">
                    {filteredFAQs.length} {filteredFAQs.length === 1 ? 'result' : 'results'}
                  </div>
                </div>

                {/* FAQ List */}
                {/* FAQ List */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {filteredFAQs.length > 0 ? (
                    filteredFAQs.map((faq) => (
                      <ThemeCard key={faq.id} className="overflow-hidden" variant="default" hover={false}>
                        <button
                          onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                          className="flex w-full items-center justify-between p-5 text-left transition-colors duration-200 hover:bg-[var(--color-primary)]/5 sm:p-6"
                        >
                          {/* ================= DESKTOP (UNCHANGED) ================= */}
                          <div className="hidden flex-1 items-center gap-4 sm:flex">
                            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)]/10 p-2 text-[var(--color-primary)]">
                              {faq.icon}
                            </div>

                            <div className="flex-1">
                              <h3 className="mb-2 text-lg font-semibold text-[var(--color-text)]">
                                {faq.question}
                              </h3>

                              <div className="flex flex-wrap gap-2">
                                {faq.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-[var(--color-textSecondary)]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="hidden items-center gap-2 sm:flex">
                            {(user?.role === 'admin' || user?.role === 'manager') && faq.roles.includes('admin') && (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">
                                Admin
                              </span>
                            )}
                            {expandedFAQ === faq.id ? (
                              <ChevronDown size={20} className="text-[var(--color-primary)]" />
                            ) : (
                              <ChevronRight size={20} className="text-[var(--color-textSecondary)]" />
                            )}
                          </div>

                          {/* ================= MOBILE (QUESTION + ARROW ONLY) ================= */}
                          <div className="flex w-full items-center justify-between sm:hidden">
                            <h3 className="text-sm font-semibold text-[var(--color-text)]">
                              {faq.question}
                            </h3>

                            {expandedFAQ === faq.id ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </div>
                        </button>

                        {/* ANSWER (same for both, padding responsive only) */}
                        {expandedFAQ === faq.id && (
                          <div className="border-t border-[var(--color-border)] px-4 pb-4 sm:px-6 sm:pb-6">
                            <div className="pt-4">
                              <p className="text-sm sm:text-base text-[var(--color-text)] leading-relaxed whitespace-pre-line">
                                {faq.answer}
                              </p>
                            </div>
                          </div>
                        )}
                      </ThemeCard>

                    ))
                  ) : (
                    <ThemeCard className="p-12 text-center" variant="glass">
                      <HelpCircle size={48} className="mx-auto mb-4 text-[var(--color-textSecondary)] opacity-50" />
                      <h3 className="text-xl font-semibold text-[var(--color-text)] mb-2">
                        No help topics found
                      </h3>
                      <p className="text-[var(--color-textSecondary)]">
                        Try adjusting your search terms or selecting a different category.
                      </p>
                    </ThemeCard>
                  )}
                </div>

              </div>
            </ThemeCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
