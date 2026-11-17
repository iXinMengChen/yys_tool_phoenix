import type { HTMLAttributes } from "react";

type IconProps = HTMLAttributes<HTMLSpanElement> & { spin?: boolean };
function icon(name: string) {
  return function Icon(props: IconProps) {
    return <span aria-hidden="true" data-icon={name} className={`ui-icon ui-icon-${name}`} {...props} />;
  };
}

export const AppstoreOutlined = icon("appstore");
export const ArrowRightOutlined = icon("arrow-right");
export const CalculatorOutlined = icon("calculator");
export const DashboardOutlined = icon("dashboard");
export const FundProjectionScreenOutlined = icon("projection");
export const LinkOutlined = icon("link");
export const QuestionCircleOutlined = icon("question");
export const SkinOutlined = icon("skin");
export const StarOutlined = icon("star");
export const TrophyOutlined = icon("trophy");
export const MoonOutlined = icon("moon");
export const SunOutlined = icon("sun");
export const DesktopOutlined = icon("desktop");
export const InfoCircleOutlined = icon("info");
export const CheckOutlined = icon("check");
export const GithubOutlined = icon("github");
export const GlobalOutlined = icon("global");
export const SyncOutlined = icon("sync");
export const CheckCircleOutlined = icon("check-circle");
export const HistoryOutlined = icon("history");
export const LoginOutlined = icon("login");
export const MenuFoldOutlined = icon("menu-fold");
export const MenuOutlined = icon("menu");
export const MenuUnfoldOutlined = icon("menu-unfold");
export const ControlOutlined = icon("control");
export const HomeOutlined = icon("home");
export const SearchOutlined = icon("search");
export const SettingOutlined = icon("setting");
export const CheckCircleFilled = icon("check-circle-filled");
export const ReloadOutlined = icon("reload");
export const DeleteOutlined = icon("delete");
export const ArrowLeftOutlined = icon("arrow-left");
export const DownOutlined = icon("down");
export const StopOutlined = icon("stop");
export const CloudDownloadOutlined = icon("cloud-download");
export const DownloadOutlined = icon("download");
export const SaveOutlined = icon("save");
