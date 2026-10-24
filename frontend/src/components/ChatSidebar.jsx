import React from "react";
import Icon from "./Icon.jsx";

export default function ChatSidebar({
    conversations,
    activeId,
    open,
    userEmail,
    onNewChat,
    onSelect
}) {
    return (
        <aside
            className={`sidebar fixed bottom-0 left-0 top-16 z-40 flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[#10131b] transition-[transform,width] duration-200 ease-out md:relative md:inset-auto md:z-auto md:translate-x-0 ${
                open ? "translate-x-0 md:w-[260px]" : "-translate-x-full border-r-0 md:w-0"
            }`}
            inert={!open}
            aria-hidden={!open}
        >
            <div className="flex h-16 shrink-0 items-center gap-3 px-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                    <Icon name="spark" size={17} />
                </span>
                <span className="whitespace-nowrap text-sm font-semibold tracking-wide">Smart Notes</span>
            </div>

            <div className="shrink-0 px-3 pb-5 pt-2">
                <button className="new-chat-button" onClick={onNewChat} title="New chat">
                    <Icon name="plus" size={18} />
                    <span>New chat</span>
                </button>
            </div>

            <div className="shrink-0 px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Recent
            </div>
            <nav aria-label="Recent conversations" className="sidebar-scroll flex-1 overflow-y-auto px-2">
                {conversations.map((conversation) => (
                    <button
                        aria-current={conversation.id === activeId ? "page" : undefined}
                        className={`conversation-link ${
                            conversation.id === activeId ? "conversation-link-active" : ""
                        }`}
                        key={conversation.id}
                        onClick={() => onSelect(conversation.id)}
                        title={conversation.title}
                    >
                        <Icon name="chat" size={16} />
                        <span>{conversation.title}</span>
                    </button>
                ))}
            </nav>

            <div className="shrink-0 border-t border-white/[0.06] p-3">
                <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/70 text-xs font-semibold text-slate-200">
                        {userEmail ? userEmail.slice(0, 1).toUpperCase() : "G"}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-300">{userEmail || "Guest"}</p>
                        <p className="truncate text-[10px] text-slate-600">
                            {userEmail ? "Signed in" : "Temporary session"}
                        </p>
                    </div>
                    <Icon name="chevron" size={15} className="shrink-0 text-slate-600" />
                </div>
            </div>
        </aside>
    );
}
