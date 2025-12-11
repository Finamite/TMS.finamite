import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search, Mail, Phone, MessageCircle, HelpCircle, ChevronDown, ChevronRight, Settings, BarChart3, CheckSquare, Filter, CreditCard as Edit3, UserPlus, Bell, Trash2, RotateCcw, Shield, Clock, Target, FileText, Archive, Download, Star } from 'lucide-react';

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
    default: `rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg`,
    glass: `rounded-2xl bg-[var(--color-surface)] backdrop-blur-xl border border-[var(--color-border)] shadow-xl`,
    elevated: `rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl`,
    bordered: `rounded-2xl bg-[var(--color-chat)] border-2 border-blue-200/50`
  };

  const hoverClasses = hover ? "hover:shadow-xl hover:scale-[1.02] hover:border-blue-300/30" : "";

  return (
    <div className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
};


const HelpSupport: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

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
      answer: 'Navigate to the "Chat" section to communicate with team members. You can send direct messages to individual team members or create group conversations. The chat supports real-time messaging and helps coordinate team activities and task discussions.',
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
      answer: 'Use the filter options available on task pages to: 1) Filter by due date or date range, 2) Filter by task priority (high, medium, low), 3) Filter by task status, 4) Filter by task type, 5) Use the search bar to find tasks by title or description. Combine multiple filters for better results.',
      category: 'navigation',
      roles: ['employee', 'manager', 'admin'],
      icon: <Search size={20} />,
      tags: ['filter', 'search', 'tasks', 'priority', 'date']
    },

    // General FAQs
    {
      id: '13',
      question: 'How do I change my password?',
      answer: 'Click on your profile icon in the top right corner, select "Profile Settings", then navigate to "Security" tab. Enter your current password and your new password twice to confirm. Your password should be at least 8 characters long and include a mix of letters, numbers, and special characters.',
      category: 'account',
      roles: ['employee', 'manager', 'admin'],
      icon: <Shield size={20} />,
      tags: ['password', 'security', 'account', 'profile']
    },
    {
      id: '14',
      question: 'What are the different task priorities and what do they mean?',
      answer: 'Task priorities help organize work importance: 1) High Priority - Urgent tasks requiring immediate attention, 2) Medium Priority - Important tasks with moderate deadlines, 3) Low Priority - Tasks that can be completed when time permits. High priority tasks may have restrictions on revisions and affect performance scoring more significantly.',
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
    {
      id: '17',
      question: 'How can I export or download my task data?',
      answer: 'Most data views include export options: 1) Look for the "Export" or "Download" button on task lists, 2) Choose your preferred format (Excel, CSV, PDF), 3) Select date ranges and filters before exporting, 4) Your exported file will include all visible data based on your current filters and permissions.',
      category: 'data-management',
      roles: ['employee', 'manager', 'admin'],
      icon: <Download size={20} />,
      tags: ['export', 'download', 'excel', 'csv', 'data']
    }
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
    { id: 'data-management', name: 'Data Management', icon: <Archive size={16} /> }
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

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const supportNumber = "+99886 00362";

  const getUserRoleDisplay = () => {
    if (user?.role === 'admin') return 'Administrator';
    if (user?.role === 'manager') return 'Manager';
    return 'Team Member';
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-6">
      <div className="max-w-15xl mx-auto">
        {/* Header */}
        <div className="mb-6">

          {/* Icon + Title (Left aligned) */}
          <div className="flex items-center space-x-4 mb-1">
            <div className="p-3 rounded-xl shadow-xl bg-gradient-to-r from-purple-600 to-blue-500">
              <HelpCircle size={18} className="text-white" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">
                Help & Support Center
              </h1>

              {/* Welcome text directly under the title */}
              <p className="text-xs text-[var(--color-textSecondary)] max-w-xl mt-1">
                Welcome, <span className="font-semibold text-blue-600">{user?.username}</span> ({getUserRoleDisplay()})!
                Find answers to your questions and get the help you need.
              </p>
            </div>
          </div>

        </div>



        {/* Main Layout: Left Sidebar + Right Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Contact Information */}
          <div className="lg:col-span-1 space-y-6">
            <ThemeCard className="p-6" variant="elevated">
              <div className="space-y-6">

                <h2 className="text-xl font-bold text-[var(--color-text)]">Contact Support</h2>

                {/* EMAIL SUPPORT */}
                <div className="flex flex-col space-y-4">

                  {/* Left Side */}
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-2xl bg-indigo-100 flex-shrink-0">
                      <Mail size={24} className="text-[var(--color-primary)]" />
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[var(--color-text)]">Email Support</h3>
                      <a href="mailto:support@taskflow.com" className="text-[var(--color-primary)] font-semibold hover:underline">
                        info@finamite.in
                      </a>
                      <p className="text-sm text-[var(--color-textsecondary)] mt-1">
                        We'll respond within 24 hours
                      </p>
                    </div>
                  </div>

                  {/* Button ALWAYS BELOW TEXT */}
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=info@finamite.in&su=Support%20Request"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 
             w-full px-4 py-3 
             bg-[var(--color-primary)] text-white rounded-xl 
             hover:[var(--color-primary)] transition-all duration-200 font-semibold shadow-sm"
                  >
                    <Mail size={18} />
                    <span>Send Email</span>
                  </a>
                </div>

                <div className="border-t border-gray-200 my-4"></div>

                {/* PHONE SUPPORT */}
                <div className="flex flex-col space-y-4">

                  {/* Left Side */}
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-2xl bg-green-100 flex-shrink-0">
                      <Phone size={24} className="text-green-600" />
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[var(--color-text)]">Phone Support</h3>
                      <a href="tel:99886 00362" className="text-green-600 font-semibold text-lg hover:underline">
                        +91 99886 00362
                      </a>
                      <p className="text-sm text-[var(--color-textsecondary)] mt-1">
                        Mon–Sat, 10 AM – 6:30 PM IST
                      </p>
                    </div>
                  </div>

                  {/* Button ALWAYS BELOW TEXT */}

                  <a
                    href={
                      isMobile
                        ? `tel:${supportNumber}`
                        : `https://wa.me/${supportNumber.replace("+", "")}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 
             w-full px-4 py-3 
             bg-green-600 text-white rounded-xl 
             hover:bg-green-700 transition-all duration-200 font-semibold shadow-sm"
                  >
                    <Phone size={18} />
                    <span>Call Now</span>
                  </a>
                </div>

              </div>
            </ThemeCard>
          </div>



          {/* Right Content - Search, Filter & FAQ */}
          <div className="lg:col-span-2">
            <ThemeCard className="p-6" variant="glass">
              <div className="space-y-6">
                {/* Search Bar */}
                <div className="relative">
                  <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--color-text)]" />
                  <input
                    type="text"
                    placeholder="Search for help topics, features, or questions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl text-[var(--color-text)] placeholder-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-3">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 ${selectedCategory === category.id
                        ? 'bg-[var(--color-primary)] text-white shadow-lg'
                        : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-chat)] border border-[var(--color-border)]'
                        }`}
                    >
                      <div className={selectedCategory === category.id ? 'text-white' : 'text-blue-600'}>
                        {category.icon}
                      </div>
                      <span className="font-medium">{category.name}</span>
                    </button>
                  ))}
                </div>

                {/* Results Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-[var(--color-text)]">
                    {selectedCategory === 'all' ? 'All Help Topics' : categories.find(c => c.id === selectedCategory)?.name}
                  </h2>
                  <div className="text-sm px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                    {filteredFAQs.length} {filteredFAQs.length === 1 ? 'result' : 'results'}
                  </div>
                </div>

                {/* FAQ List */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {filteredFAQs.length > 0 ? (
                    filteredFAQs.map((faq) => (
                      <ThemeCard key={faq.id} className="overflow-hidden" variant="default" hover={false}>
                        <button
                          onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                          className="w-full p-6 text-left flex items-center justify-between hover:bg-[var(--color-surfacehelp)] transition-colors duration-200"
                        >
                          <div className="flex items-center space-x-4 flex-1">
                            <div className="p-2 rounded-xl bg-blue-50">
                              <div className="text-blue-600">
                                {faq.icon}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                                {faq.question}
                              </h3>
                              <div className="flex flex-wrap gap-2">
                                {faq.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {(user?.role === 'admin' || user?.role === 'manager') && faq.roles.includes('admin') && (
                              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600 font-bold">
                                Admin
                              </span>
                            )}
                            {expandedFAQ === faq.id ? (
                              <ChevronDown size={20} className="text-blue-600" />
                            ) : (
                              <ChevronRight size={20} className="text-gray-400" />
                            )}
                          </div>
                        </button>

                        {expandedFAQ === faq.id && (
                          <div className="px-6 pb-6 border-t border-gray-200">
                            <div className="pt-4">
                              <p className="text-[var(--color-text)] leading-relaxed whitespace-pre-line">
                                {faq.answer}
                              </p>
                            </div>
                          </div>
                        )}
                      </ThemeCard>
                    ))
                  ) : (
                    <ThemeCard className="p-12 text-center" variant="glass">
                      <HelpCircle size={48} className="mx-auto mb-4 text-gray-400 opacity-50" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        No help topics found
                      </h3>
                      <p className="text-gray-600">
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