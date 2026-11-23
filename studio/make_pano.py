"""Turns one wide film still into a full 360-degree backdrop: the still is
mirrored four times around the horizon (so every join is seamless) and the
sky and ground are continued past its edges as soft gradients."""
import sys, cv2, numpy as np
src=cv2.imread(sys.argv[1]); out=sys.argv[2]
h0,w0=src.shape[:2]
W,H=8192,4096
tile=W//4
sh=int(round(h0*tile/w0))
still=cv2.resize(src,(tile,sh),interpolation=cv2.INTER_LANCZOS4)
blur=cv2.GaussianBlur(still,(0,0),1.2); still=cv2.addWeighted(still,1.35,blur,-0.35,0)
strip=np.concatenate([still, still[:,::-1], still, still[:,::-1]],axis=1)
strip=np.roll(strip, W//2 - tile//2, axis=1)
HORIZON=float(sys.argv[3]) if len(sys.argv)>3 else 0.5
top=int(H/2 - HORIZON*sh); bot=top+sh
pano=np.zeros((H,W,3),np.float32)
pano[top:bot]=strip
def wrap_blur(img, sx, sy):
    pad=int(min(img.shape[1], sx*3+2))
    big=np.concatenate([img[:,-pad:],img,img[:,:pad]],axis=1)
    return cv2.GaussianBlur(big,(0,0),sigmaX=sx,sigmaY=sy,borderType=cv2.BORDER_REFLECT)[:,pad:-pad]
def extend(edge_rows, n, toward):
    S=4
    small=cv2.resize(edge_rows,(edge_rows.shape[1]//S, max(2,edge_rows.shape[0]//S)),interpolation=cv2.INTER_AREA).astype(np.float32)
    ns=int(np.ceil(n/S))
    reps=int(np.ceil(ns/small.shape[0]))
    stack=np.concatenate([small if i%2==0 else small[::-1] for i in range(reps)],axis=0)[:ns]
    out=np.empty_like(stack)
    bands=20
    for b in range(bands):
        a,bn=int(ns*b/bands),int(ns*(b+1)/bands)
        sig=1.0+(b/bands)**1.2*70
        out[a:bn]=wrap_blur(stack,sig,min(sig,20))[a:bn]
    out=cv2.GaussianBlur(out,(0,0),sigmaX=0.1,sigmaY=4)
    full=cv2.resize(out,(edge_rows.shape[1],ns*S),interpolation=cv2.INTER_CUBIC)[:n]
    t=(np.linspace(0,1,n)**1.5)[:,None,None]
    return full*(1-t)+np.array(toward,np.float32)[None,None,:]*t
pano[:top]=extend(strip[:int(sh*0.11)], top, (214,128,146))[::-1]
pano[bot:]=extend(strip[int(sh*0.93):][::-1], H-bot, (206,74,52))
for y in (top,bot):
    a,b=max(0,y-48),min(H,y+48)
    seg=cv2.GaussianBlur(pano[a:b],(0,0),7)
    wgt=(1-np.abs(np.linspace(-1,1,b-a)))[:,None,None]**1.5
    pano[a:b]=pano[a:b]*(1-wgt)+seg*wgt
pano=np.clip(pano,0,255).astype(np.uint8)
cv2.imwrite(out+'_8k.jpg',pano,[cv2.IMWRITE_JPEG_QUALITY,92])
cv2.imwrite(out+'_4k.jpg',cv2.resize(pano,(4096,2048),interpolation=cv2.INTER_AREA),[cv2.IMWRITE_JPEG_QUALITY,92])
cv2.imwrite(out+'_preview.jpg',cv2.resize(pano,(1600,800),interpolation=cv2.INTER_AREA))
