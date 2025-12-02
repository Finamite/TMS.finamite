import { useState } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TeamPendingCounts {
    oneTimeToday: number;
    oneTimeOverdue: number;
    dailyToday: number;
    recurringToday: number;
    recurringOverdue: number;
}

interface TeamPendingData {
    [username: string]: TeamPendingCounts;
}

interface UserData {
    username: string;
    role: string;
}

interface Props {
    teamPendingData: TeamPendingData;
    user: UserData;
}

type SlideDirection = "left" | "right";

const TeamPendingTasksChart = ({ teamPendingData, user }: Props) => {
    const [page, setPage] = useState<number>(0);
    const [isAnimating, setIsAnimating] = useState<boolean>(false);
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

    const pageSize = isMobile ? 4 : 5;

    const usersList = Object.keys(teamPendingData || {});
    const paginatedUsers = usersList.slice(page, page + pageSize);

    const chartData =
        user?.role === "admin" || user?.role === "manager"
            ? paginatedUsers.map(username => ({
                username,
                pending:
                    (teamPendingData[username]?.oneTimeToday || 0) +
                    (teamPendingData[username]?.dailyToday || 0) +
                    (teamPendingData[username]?.recurringToday || 0),
                overdue:
                    (teamPendingData[username]?.oneTimeOverdue || 0) +
                    (teamPendingData[username]?.recurringOverdue || 0),
            }))
            : [
                {
                    name: "One-Time Today",
                    value: teamPendingData[user.username]?.oneTimeToday || 0,
                    fill: "url(#gradOneTimeToday)",
                },
                {
                    name: "One-Time Overdue",
                    value: teamPendingData[user.username]?.oneTimeOverdue || 0,
                    fill: "url(#gradOneTimeOverdue)",
                },
                {
                    name: "Daily Today",
                    value: teamPendingData[user.username]?.dailyToday || 0,
                    fill: "url(#gradDaily)",
                },
                {
                    name: "Recurring Pending",
                    value: teamPendingData[user.username]?.recurringToday || 0,
                    fill: "url(#gradRecPending)",
                },
                {
                    name: "Recurring Overdue",
                    value: teamPendingData[user.username]?.recurringOverdue || 0,
                    fill: "url(#gradRecOverdue)",
                },
            ];

    const slide = (direction: SlideDirection) => {
        if (isAnimating) return;

        const target =
            direction === "left"
                ? Math.max(0, page - 1)
                : Math.min(usersList.length - pageSize, page + 1);

        if (target === page) return;

        setIsAnimating(true);

        setTimeout(() => {
            setPage(target);
            setIsAnimating(false);
        }, 200);
    };
    const hasAnyData = Object.values(teamPendingData || {}).some(userData =>
    (userData.oneTimeToday ||
        userData.oneTimeOverdue ||
        userData.dailyToday ||
        userData.recurringToday ||
        userData.recurringOverdue)
    );

    if (!hasAnyData) {
        return (
            <div className="w-full py-14 flex flex-col items-center justify-center text-center">
                <div className="p-4 rounded-2xl bg-[var(--color-surface)] shadow-lg border border-[var(--color-border)]">
                    <svg width="70" height="70" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="gradSuccess" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#9f55eeff" />
                                <stop offset="100%" stopColor="#4f8af0ff" />
                            </linearGradient>
                        </defs>
                        <circle cx="12" cy="12" r="10" stroke="url(#gradSuccess)" strokeWidth="2" />
                        <path
                            d="M8 12l2.5 2.5L16 9"
                            stroke="url(#gradSuccess)"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>

                </div>

                <h2 className="text-lg font-bold mt-4 text-[var(--color-text)]">
                    No Pending or Overdue Tasks
                </h2>

                <p className="text-sm text-[var(--color-textSecondary)] mt-2 max-w-xs">
                    Great job! All tasks are completed, and nothing is due today.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full">

            {/* *************** DESKTOP VIEW *************** */}
            {!isMobile && (
                <div className="w-full flex items-center justify-between gap-3">

                    {/* LEFT ARROW */}
                    <button
                        onClick={() => slide("left")}
                        disabled={page === 0 || isAnimating}
                        className="p-2 rounded-full bg-[var(--color-surface)]
                        border border-[var(--color-border)] shadow-md disabled:opacity-40"
                    >
                        <ChevronLeft size={22} />
                    </button>

                    {/* CHART */}
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={chartData} barGap={6}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />

                                <XAxis
                                    dataKey={user?.role === "admin" || user?.role === "manager" ? "username" : "name"}
                                    tick={{ fill: "var(--color-text)", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />

                                <YAxis
                                    tick={{ fill: "var(--color-text)", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />

                                <Tooltip
                                    contentStyle={{
                                        background: "var(--color-surface)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: "12px",
                                    }}
                                />

                                {/* GRADIENTS */}
                                <defs>
                                    <linearGradient id="gradOneTimeToday" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#6a11cb" />
                                        <stop offset="50%" stopColor="#2575fc" />
                                        <stop offset="100%" stopColor="#00d4ff" />
                                    </linearGradient>
                                    <linearGradient id="gradOneTimeOverdue" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#a940f0" />
                                        <stop offset="50%" stopColor="#a869d3" />
                                        <stop offset="100%" stopColor="#1614b1" />
                                    </linearGradient>
                                    <linearGradient id="gradDaily" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#22dcf5" />
                                        <stop offset="100%" stopColor="#04b9dd" />
                                    </linearGradient>
                                    <linearGradient id="gradRecPending" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#6a11cb" />
                                        <stop offset="100%" stopColor="#2575fc" />
                                    </linearGradient>
                                    <linearGradient id="gradRecOverdue" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#d946ef" />
                                        <stop offset="100%" stopColor="#9b2ddc" />
                                    </linearGradient>
                                </defs>

                                {(user?.role === "admin" || user?.role === "manager") && (
                                    <>
                                        <Bar dataKey="pending" fill="url(#gradOneTimeToday)" radius={[8, 8, 0, 0]} />
                                        <Bar dataKey="overdue" fill="url(#gradOneTimeOverdue)" radius={[8, 8, 0, 0]} />
                                    </>
                                )}

                                {!(user?.role === "admin" || user?.role === "manager") && (
                                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                        {(chartData as any[]).map((entry, index) => (
                                            <Cell key={index} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* RIGHT ARROW */}
                    <button
                        onClick={() => slide("right")}
                        disabled={page + pageSize >= usersList.length || isAnimating}
                        className="p-2 rounded-full bg-[var(--color-surface)]
                        border border-[var(--color-border)] shadow-md disabled:opacity-40"
                    >
                        <ChevronRight size={22} />
                    </button>
                </div>
            )}

            {/* *************** MOBILE VIEW *************** */}
            {isMobile && (
                <>
                    {/* CHART */}
                    <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={chartData} barGap={6}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />

                            <XAxis
                                dataKey={user?.role === "admin" || user?.role === "manager" ? "username" : "name"}
                                tick={{ fill: "var(--color-text)", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />

                            <YAxis
                                tick={{ fill: "var(--color-text)", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />

                            <Tooltip
                                contentStyle={{
                                    background: "var(--color-surface)",
                                    border: "1px solid var(--color-border)",
                                    borderRadius: "12px",
                                }}
                            />

                            {/* GRADIENTS (same as PC) */}
                            <defs>
                                <linearGradient id="gradOneTimeToday" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#6a11cb" />
                                    <stop offset="50%" stopColor="#2575fc" />
                                    <stop offset="100%" stopColor="#00d4ff" />
                                </linearGradient>
                                <linearGradient id="gradOneTimeOverdue" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#a940f0" />
                                    <stop offset="50%" stopColor="#a869d3" />
                                    <stop offset="100%" stopColor="#1614b1" />
                                </linearGradient>
                                <linearGradient id="gradDaily" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#22dcf5" />
                                    <stop offset="100%" stopColor="#04b9dd" />
                                </linearGradient>
                                <linearGradient id="gradRecPending" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#6a11cb" />
                                    <stop offset="100%" stopColor="#2575fc" />
                                </linearGradient>
                                <linearGradient id="gradRecOverdue" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#d946ef" />
                                    <stop offset="100%" stopColor="#9b2ddc" />
                                </linearGradient>
                            </defs>

                            {(user?.role === "admin" || user?.role === "manager") && (
                                <>
                                    <Bar dataKey="pending" fill="url(#gradOneTimeToday)" radius={[8, 8, 0, 0]} />
                                    <Bar dataKey="overdue" fill="url(#gradOneTimeOverdue)" radius={[8, 8, 0, 0]} />
                                </>
                            )}

                            {!(user?.role === "admin" || user?.role === "manager") && (
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                    {(chartData as any[]).map((entry, index) => (
                                        <Cell key={index} fill={entry.fill} />
                                    ))}
                                </Bar>
                            )}
                        </BarChart>
                    </ResponsiveContainer>

                    {/* MOBILE ARROWS BELOW */}
                    {(user?.role === "admin" || user?.role === "manager") && (
                        <div className="flex items-center justify-center gap-10 mt-3">

                            <button
                                onClick={() => slide("left")}
                                disabled={page === 0 || isAnimating}
                                className="p-2 rounded-full bg-[var(--color-surface)]
                                border border-[var(--color-border)] shadow-md disabled:opacity-40"
                            >
                                <ChevronLeft size={22} />
                            </button>

                            <button
                                onClick={() => slide("right")}
                                disabled={page + pageSize >= usersList.length || isAnimating}
                                className="p-2 rounded-full bg-[var(--color-surface)]
                                border border-[var(--color-border)] shadow-md disabled:opacity-40"
                            >
                                <ChevronRight size={22} />
                            </button>

                        </div>
                    )}
                </>
            )}

        </div>
    );
};

export default TeamPendingTasksChart;
