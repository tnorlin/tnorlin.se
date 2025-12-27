export const SITE = {
  website: "https://tnorlin.se/",
  author: "Tony Norlin",
  desc: "The personal blog of Tony Norlin.",
  profile: "https://tnorlin.se/",
  title: "tnorlin.se",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "Edit page",
    url: "https://github.com/tnorlin/tnorlin.se/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "Europe/Stockholm",
} as const;
