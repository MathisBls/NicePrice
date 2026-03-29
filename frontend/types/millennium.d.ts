interface SteamLocation {
    pathname: string;
}

interface MainWindowBrowserManager {
    m_lastLocation?: SteamLocation
}

interface MilleniumPopup {
    document: Document;
}

interface MilleniumWindowContext {
    m_strName?: string;
    m_popup?: MilleniumPopup;
}

declare global {
    interface Window {
        SP_REACT: typeof import('react');
        MainWindowBrowserManager?: MainWindowBrowserManager;
    }
}

export type { MilleniumWindowContext };