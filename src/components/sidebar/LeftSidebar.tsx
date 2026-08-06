import SidebarContent from '@/components/sidebar/SidebarContent'

/** Desktop sidebar — hidden on small screens (MobileSidebar covers those) */
export default function LeftSidebar() {
    return (
        <aside className="w-72 bg-surface border-r border-edge flex-shrink-0 hidden md:block sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
            <SidebarContent />
        </aside>
    )
}
