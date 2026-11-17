!include "LogicLib.nsh"
!insertmacro GetDrives

; 保存首次安装时选择到的非系统盘符；已有安装由 Tauri 的注册表路径逻辑继续接管。
Var PreferredInstallDrive

Function SelectPreferredInstallDrive
  StrCpy $PreferredInstallDrive ""
  ; GetDrives 按盘符顺序枚举本地硬盘，因此这里会优先命中 D:、E: 等非 C 盘。
  ${GetDrives} "HDD" FindNonSystemDrive
  StrCmp $PreferredInstallDrive "" 0 +2
    StrCpy $PreferredInstallDrive "C:\"
FunctionEnd

Function FindNonSystemDrive
  StrCpy $0 $9 1
  ${StrCase} $1 $0 "U"
  StrCmp $1 "C" 0 found
    Push ""
    Return

  found:
    StrCpy $PreferredInstallDrive $9
    Push "StopGetDrives"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; 已有安装记录时保留原目录，避免升级过程中把程序从 C 盘搬到其他盘。
  ReadRegStr $0 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $0 "" first_install done

  first_install:
    ; 只处理 Tauri 默认的当前用户目录；用户手动选择的路径不会被覆盖。
    StrCmp $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}" 0 done
      Call SelectPreferredInstallDrive
      StrCmp $PreferredInstallDrive "" done
        StrCpy $INSTDIR "$PreferredInstallDrive${PRODUCTNAME}"
        ; Tauri 模板在钩子前已经设置过一次输出目录，改盘符后需要重新设置。
        SetOutPath "$INSTDIR"

  done:
    ; Phoenix 使用独立 PRODUCTNAME、identifier 和“号来 Phoenix.exe”。
    ; 不终止旧版进程；若用户手选旧安装目录，拒绝覆盖旧版文件。
    IfFileExists "$INSTDIR\号来.exe" legacy_installation 0
    IfFileExists "$INSTDIR\yys-cbg-inspector-tauri.exe" legacy_installation safe_installation

  legacy_installation:
    MessageBox MB_OK|MB_ICONSTOP "该目录包含旧版号来，请为号来 Phoenix 选择独立安装目录。"
    Abort

  safe_installation:
!macroend
