import SidebarContent from '@/components/sidebar/SidebarContent'

/** Desktop filter sidebar, inline from lg up (MobileSidebar covers narrower screens) */
export default function LeftSidebar() {
    return (
        <aside className="w-64 bg-surface border-r border-edge flex-shrink-0 hidden lg:block sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
            <SidebarContent />
        </aside>
    )
}
