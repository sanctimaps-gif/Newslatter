import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { IS_DEMO } from './services/demo';
import { AuthProvider } from './hooks/useAuth';
import { ConfirmProvider, ToastProvider } from './components/ui';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Subscribers from './pages/admin/Subscribers';
import { CreateFromTemplateRedirect, NewsletterEditorPage, NewslettersPage, TemplateEditorPage, TemplatesPage } from './pages/admin/Content';
import { CampaignDetailPage, CampaignWizardPage, CampaignsPage, SchedulingPage } from './pages/admin/Campaigns';
import { AutomationsPage, StatisticsPage } from './pages/admin/Insights';
import SettingsPage from './pages/admin/Settings';
import { AccountPage, ProfilePage } from './pages/admin/Account';
import ProjetPage from './pages/admin/Projet';
import { ConfidentialitePage, ConfirmationPage, DesinscriptionPage, InscriptionPage } from './pages/public/PublicPages';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/public/AuthPages';
import PublicLayout from './layouts/PublicLayout';

function CreatePage() {
  const [p] = useSearchParams();
  return p.get('modele') ? <CreateFromTemplateRedirect /> : <NewsletterEditorPage />;
}

export default function App() {
  return (
    <AuthProvider><ToastProvider><ConfirmProvider>
      <Routes>
        <Route path="/" element={<Navigate to={IS_DEMO ? '/admin' : '/inscription'} replace />} />
        <Route path="/inscription" element={<InscriptionPage />} />
        <Route path="/confirmation" element={<ConfirmationPage />} />
        <Route path="/desinscription" element={<DesinscriptionPage />} />
        <Route path="/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/admin/connexion" element={<LoginPage />} />
        <Route path="/admin/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
        <Route path="/admin/reinitialisation" element={<ResetPasswordPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="abonnes" element={<Subscribers />} />
          <Route path="newsletters" element={<NewslettersPage />} />
          <Route path="newsletters/:id" element={<NewsletterEditorPage />} />
          <Route path="creer" element={<CreatePage />} />
          <Route path="campagnes" element={<CampaignsPage />} />
          <Route path="campagnes/nouvelle" element={<CampaignWizardPage />} />
          <Route path="campagnes/:id" element={<CampaignDetailPage />} />
          <Route path="campagnes/:id/modifier" element={<CampaignWizardPage />} />
          <Route path="programmation" element={<SchedulingPage />} />
          <Route path="modeles" element={<TemplatesPage />} />
          <Route path="modeles/:id" element={<TemplateEditorPage />} />
          <Route path="automatisations" element={<AutomationsPage />} />
          <Route path="statistiques" element={<StatisticsPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="compte" element={<AccountPage />} />
          <Route path="projet" element={<ProjetPage />} />
        </Route>
        <Route path="*" element={<PublicLayout><div className="card p-8 text-center"><h1 className="text-2xl font-semibold">Page introuvable</h1><p className="text-ink-soft mt-2"><Link to="/inscription">S'inscrire à la lettre</Link></p></div></PublicLayout>} />
      </Routes>
    </ConfirmProvider></ToastProvider></AuthProvider>
  );
}
