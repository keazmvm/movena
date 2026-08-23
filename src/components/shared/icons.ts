import {
  Bell,
  CalendarDays,
  Captions,
  Circle,
  CircleHelp,
  CirclePlay,
  Clock3,
  Contrast,
  Download,
  Film,
  Folder,
  Gauge,
  Grid3X3,
  HardDrive,
  Heart,
  History,
  Home,
  Import,
  Keyboard,
  ListVideo,
  Maximize,
  Minimize,
  Music2,
  Palette,
  Pause,
  Play,
  RadioTower,
  Rows3,
  Search,
  Server,
  Settings,
  SkipForward,
  Sparkles,
  Star,
  Terminal,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';

/**
 * Stable semantic aliases for the application's icon vocabulary.
 *
 * These names intentionally preserve the existing call sites while removing
 * the incompatible Remix Icon dependency. All implementations come from
 * lucide-react (ISC). Line/fill aliases share geometry; active state remains
 * conveyed by the surrounding selected surface and accessible state.
 */
export type RemixiconComponentType = LucideIcon;

export const RiAspectRatioFill = Maximize;
export const RiAspectRatioLine = Maximize;
export const RiCalendarScheduleFill = CalendarDays;
export const RiCalendarScheduleLine = CalendarDays;
export const RiClosedCaptioningFill = Captions;
export const RiClosedCaptioningLine = Captions;
export const RiContrastFill = Contrast;
export const RiContrastLine = Contrast;
export const RiDownload2Fill = Download;
export const RiDownload2Line = Download;
export const RiEqualizer3Fill = Gauge;
export const RiEqualizer3Line = Gauge;
export const RiFolderFill = Folder;
export const RiFolderLine = Folder;
export const RiFullscreenExitFill = Minimize;
export const RiFullscreenLine = Maximize;
export const RiHardDrive2Fill = HardDrive;
export const RiHardDrive2Line = HardDrive;
export const RiHeartFill = Heart;
export const RiHeartLine = Heart;
export const RiHistoryFill = History;
export const RiHistoryLine = History;
export const RiHome5Fill = Home;
export const RiHome5Line = Home;
export const RiHomeLine = Home;
export const RiImportFill = Import;
export const RiImportLine = Import;
export const RiKeyboardFill = Keyboard;
export const RiKeyboardLine = Keyboard;
export const RiLayoutGridFill = Grid3X3;
export const RiLayoutGridLine = Grid3X3;
export const RiLayoutRowFill = Rows3;
export const RiLayoutRowLine = Rows3;
export const RiLiveLine = RadioTower;
export const RiMovie2Fill = Film;
export const RiMovie2Line = Film;
export const RiMusic2Fill = Music2;
export const RiMusic2Line = Music2;
export const RiNotification3Fill = Bell;
export const RiNotification3Line = Bell;
export const RiPaletteFill = Palette;
export const RiPaletteLine = Palette;
export const RiPauseFill = Pause;
export const RiPlayCircleFill = CirclePlay;
export const RiPlayCircleLine = CirclePlay;
export const RiPlayFill = Play;
export const RiPlayList2Fill = ListVideo;
export const RiPlayList2Line = ListVideo;
export const RiQuestionFill = CircleHelp;
export const RiQuestionLine = CircleHelp;
export const RiRecordCircleFill = Circle;
export const RiRecordCircleLine = Circle;
export const RiSearchFill = Search;
export const RiSearchLine = Search;
export const RiServerFill = Server;
export const RiServerLine = Server;
export const RiSettings3Fill = Settings;
export const RiSettings3Line = Settings;
export const RiSkipForwardFill = SkipForward;
export const RiSlideshow3Fill = Tv;
export const RiSlideshow3Line = Tv;
export const RiSparklingFill = Sparkles;
export const RiSparklingLine = Sparkles;
export const RiSpeedUpFill = Gauge;
export const RiSpeedUpLine = Gauge;
export const RiStarFill = Star;
export const RiStarLine = Star;
export const RiTerminalBoxFill = Terminal;
export const RiTerminalBoxLine = Terminal;
export const RiTimeFill = Clock3;
export const RiTimeLine = Clock3;
export const RiTv2Fill = Tv;
export const RiTv2Line = Tv;
export const RiVolumeDownLine = Volume1;
export const RiVolumeMuteFill = VolumeX;
export const RiVolumeUpLine = Volume2;

