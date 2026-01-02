import type { Props } from "astro";
import type { GiscusProps } from "@giscus/react";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconWhatsapp from "@/assets/icons/IconWhatsapp.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconPinterest from "@/assets/icons/IconPinterest.svg";
import IconThreads from "@/assets/icons/IconThreads.svg";
import IconDiscord from "@/assets/icons/IconDiscord.svg";
import IconBluesky from "@/assets/icons/IconBluesky.svg";
import IconChess from "@/assets/icons/IconChess.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    href: "https://github.com/tnorlin",
    linkTitle: `${SITE.title} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "X",
    href: "https://x.com/tnorlin",
    linkTitle: `${SITE.title} on X`,
    icon: IconBrandX,
  },
  {
    name: "BlueSky",
    href: "https://bsky.app/profile/tnorlin.se",
    linkTitle: `${SITE.title} on Bluesky`,
    icon: IconBluesky,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/tonynorlin/",
    linkTitle: `${SITE.title} on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "Mail",
    href: "mailto:tnorlin@pm.me",
    linkTitle: `Send an email to ${SITE.title}`,
    icon: IconMail,
  },
  {
    name: "Threads",
    href: "https://www.threads.com/@norlin_t",
    linkTitle: `${SITE.title} on Threads`,
    icon: IconThreads,
  },
  {
    name: "Discord",
    href: "https://discordapp.com/users/941423574084894730 ",
    linkTitle: `${SITE.title} on Discord`,
    icon: IconDiscord,
  },
  {
    name: "Chess",
    href: "https://www.chess.com/member/jukebox7980",
    linkTitle: `${SITE.title} on Chess`,
    icon: IconChess,
  },
] as const;

export const GISCUS: GiscusProps = {
  repo: "tnorlin/tnorlin.se",
  repoId: "R_kgDOKLycNg",
  category: "General",
  categoryId: "DIC_kwDOKLycNs4C0QkR",
  mapping: "og:title",
  reactionsEnabled: "1",
  emitMetadata: "0",
  inputPosition: "bottom",
  lang: "en",
  loading: "lazy",
};

export const SHARE_LINKS: Social[] = [
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: IconWhatsapp,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: IconPinterest,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: IconMail,
  },
] as const;
