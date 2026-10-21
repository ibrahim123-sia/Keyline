import type { Metadata } from "next";
import { PageView, PreviewBanner } from "@/components/site/page-view";
import { PreviewBridge } from "@/components/site/preview-bridge";
import { SiteChrome } from "@/components/site/site-chrome";
import { getPreviewPage } from "@/features/cms/page-public";
import { getSettings } from "@/features/settings/queries";
import { cms } from "@/lib/i18n/dictionaries/cms";

/**
 * A page's draft behind a signed link (08 §1 "Preview link, expires in 7 days"). Never
 * indexed. With ?edit=1 it is the page builder's live preview: sections can be clicked.
 */
export const instant = false;

export async function generateMetadata(props: PageProps<"/preview/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const page = await getPreviewPage(token);
  return {
    title: page ? page.title : cms.preview.expiredTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PreviewPage(props: PageProps<"/preview/[token]">) {
  const [{ token }, query] = await Promise.all([props.params, props.searchParams]);
  const edit = query.edit === "1";
  const page = await getPreviewPage(token);
  if (!page)
    return (
      <SiteChrome>
        <section className="section-y">
          <div className="container-site max-w-2xl">
            <h1 className="text-display">{cms.preview.expiredTitle}</h1>
            <p className="mt-4 text-lg text-text">{cms.preview.expiredText}</p>
          </div>
        </section>
      </SiteChrome>
    );
  const general = await getSettings("general");
  return (
    <>
      <PageView
        page={page}
        editable={edit}
        banner={
          edit ? null : <PreviewBanner expiresAt={page.expiresAt} timeZone={general.timeZone} />
        }
      />
      {edit && <PreviewBridge emptyLabel={cms.sections.nothingYet} />}
    </>
  );
}
