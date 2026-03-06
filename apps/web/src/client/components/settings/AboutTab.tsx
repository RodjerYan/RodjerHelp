import { useTranslation } from 'react-i18next';

interface AboutTabProps {
  appVersion: string;
}

export function AboutTab({ appVersion }: AboutTabProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Контакты</div>
            <div className="space-y-1">
              <a
                href="https://t.me/RodjerYan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Telegram: @RodjerYan
              </a>
              <div>
                <a href="mailto:rodjeryan@gmail.com" className="text-primary hover:underline">
                  Email: rodjeryan@gmail.com
                </a>
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.haveQuestion')}</div>
            <a href="mailto:rodjeryan@gmail.com" className="text-primary hover:underline">
              rodjeryan@gmail.com
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.versionLabel')}</div>
            <div className="font-medium">{appVersion || t('about.loading')}</div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
          {t('about.allRightsReserved')}
        </div>
      </div>
    </div>
  );
}
