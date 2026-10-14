/** Profile GP Engineering w serwisach: ikony w stopce stron dla odwiedzających i `sameAs` dostawcy w danych strukturalnych. */
export const VENDOR_PROFILES = [
  { id: "linkedin", name: "LinkedIn", href: "https://www.linkedin.com/company/gp-engineering-sp-z-o-o/" },
  { id: "facebook", name: "Facebook", href: "https://www.facebook.com/profile.php?id=61593807700558" },
  { id: "instagram", name: "Instagram", href: "https://www.instagram.com/gpengineering.pl/" },
  { id: "youtube", name: "YouTube", href: "https://www.youtube.com/@GPEngineering_GP" },
] as const;

export type VendorProfileId = (typeof VENDOR_PROFILES)[number]["id"];
