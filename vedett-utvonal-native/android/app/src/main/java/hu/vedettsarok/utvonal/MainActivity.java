package hu.vedettsarok.utvonal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import hu.vedettsarok.utvonal.navigation.VedettNavigationPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Védett Útvonal háttérnavigációs MVP — saját plugin regisztrációja a bridge létrejötte előtt.
        registerPlugin(VedettNavigationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
